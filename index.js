/**
 * Import external libraries
 */
const pino = require('pino');
const rp = require('request-promise');
const os = require('os');
const path = require('path');
const geolib = require('geolib');
const moment = require('moment');
const dateFormat = require('dateformat');
const { Client } = require('pg');
const apn = require('apn');
const { google } = require('googleapis');
const Ajv = require('ajv');

// Misc
function isEmptyObject(obj) {
  if (obj == null) return true;
  if (obj.length > 0) return false;
  if (obj.length === 0) return true;
  if (typeof obj !== 'object') return true;
  return !Object.keys(obj).length;
}
exports.isEmptyObject = (obj) => {
  const response = isEmptyObject(obj);
  return response;
};

exports.GetSortOrder = (prop) => {
  const obj = function AB(a, b) {
    if (a[prop] > b[prop]) {
      return 1;
    }
    if (a[prop] < b[prop]) return -1;
    return 0;
  };
  return obj;
};

function zeroFill(number, width) {
  const pad = width - number.toString().length;
  if (pad > 0) {
    return new Array(pad + (/\./.test(number) ? 2 : 1)).join('0') + number;
  }
  return `${number}`; // always return a string
}
exports.zeroFill = (number, width) => {
  const response = zeroFill(number, width);
  return response;
};

exports.cleanString = (input) => {
  let output = '';
  for (let i = 0; i < input.length; i += 1) {
    if (input.charCodeAt(i) <= 127) {
      output += input.charAt(i);
    }
  }
  output = output.replace(/\0/g, '');
  return output;
};

exports.addDays = function FnAddDays(date, amount) {
  const tzOff = date.getTimezoneOffset() * 60 * 1000;
  let t = date.getTime();
  const d = new Date();

  t += 1000 * 60 * 60 * 24 * amount;
  d.setTime(t);

  const tzOff2 = d.getTimezoneOffset() * 60 * 1000;
  if (tzOff !== tzOff2) {
    const diff = tzOff2 - tzOff;
    t += diff;
    d.setTime(t);
  }
  return d;
};

exports.addTime = (startTime, addTime) => {
  try {
    let newEndTime = moment();
    if (startTime !== null) newEndTime = moment(startTime, 'HH:mm');
    if (typeof addTime === 'undefined') return startTime;
    newEndTime.add(
      addTime,
      'minutes',
    );
    return newEndTime.format('HH:mm');
  } catch (err) {
    return startTime;
  }
};

exports.timeDiff = (startTime, timeFromNow, addMinutes, displayHrs) => {
  let newStartTime = moment();
  if (startTime !== null) newStartTime = moment(startTime, 'HH:mm');
  const newEndTime = moment(
    timeFromNow,
    'HH:mm',
  );

  if (newStartTime.isAfter(newEndTime)) newEndTime.add(1, 'days');

  let addMinutesToTime = 0;
  if (typeof addMinutes !== 'undefined') addMinutesToTime = addMinutes;
  newEndTime.add(
    addMinutesToTime,
    'minutes',
  );

  let minutes = newEndTime.diff(
    newStartTime,
    'minutes',
  );
  if (minutes < 0) minutes = 0;
  let returnString = `${minutes}`;

  if (displayHrs) {
    let hours = newStartTime.diff(
      newEndTime,
      'hours',
    );
    if (hours < 0) hours = 0;
    if (minutes > 60) {
      hours = 1;
      minutes -= 60;
    }
    returnString = `${zeroFill(hours, 2)}:${zeroFill(minutes, 2)}`;
  }
  return returnString;
};

exports.minutesToStop = function FnMinutesToStop(seconds) {
  const timetostopinMinutes = Math.floor(seconds / 60);
  const timeNow = new Date();
  timeNow.setMinutes(timeNow.getMinutes() + timetostopinMinutes);
  return dateFormat(
    timeNow,
    'h:MM TT',
  );
};

// Logger
function traceInfo() {
  const orig = Error.prepareStackTrace;
  Error.stackTraceLimit = 4;
  Error.prepareStackTrace = function prepStack(_, stack) {
    return stack;
  };
  const err = new Error();
  const { stack } = err;
  const frame = stack[3];
  let fileName;
  let functionName;
  let lineNumber;
  try {
    fileName = path.basename(frame.getFileName());
    functionName = frame.getFunctionName();
    lineNumber = frame.getLineNumber();
  } catch (e) {
    fileName = '[No trace data]';
    functionName = '[No trace data]';
    lineNumber = '[No trace data]';
  }
  Error.prepareStackTrace = orig;
  return `${fileName} : ${functionName} (${lineNumber})`;
}

async function log(type, message) {
  let logger;

  try {
    if (process.env.ENVIRONMENT === 'development') {
      logger = pino({
        level: 'trace',
        prettyPrint: {
          levelFirst: true,
        },
      });
    } else {
      logger = pino();
    }
    let child = logger.child({
      index: 'log',
      'trace-id': `${global.APITraceID}`,
    });

    switch (type) {
      case 'info':
        child.info(message);
        break;
      case 'trace':
        child.trace(`${traceInfo()} - ${message}`);
        break;
      case 'debug':
        child.debug(`${traceInfo()} - ${message}`);
        break;
      case 'warn':
        child.warn(`${traceInfo()} - ${message}`);
        break;
      case 'error':
        child.error(`${traceInfo()} - ${message}`);
        break;
      case 'fatal':
        child.fatal(`${traceInfo()} - ${message}`);
        break;
      case 'health':
        child = logger.child({ index: 'health' });
        child.info(message);
        break;
      default:
        logger.info(`${message}`);
        break;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err.message);
  }
}
exports.log = (type, message) => {
  log(type, message);
};

// Vault
async function vaultSecret(route, key) {
  try {
    const options = {
      apiVersion: 'v1',
      endpoint: process.env.VAULT_URL,
      token: process.env.VAULT_TOKEN,
    };
    // eslint-disable-next-line global-require
    const vault = require('node-vault')(options);

    // Check if vault is sealed
    let vaultStatus = await vault.status();
    if (vaultStatus.sealed) {
      vaultStatus = null;
      log(
        'trace',
        'Unsealing vault',
      );
      vault.unseal({ secret_shares: 1, key: process.env.VAULT_TOKEN_1 });
      vault.unseal({ secret_shares: 2, key: process.env.VAULT_TOKEN_2 });
      vault.unseal({ secret_shares: 3, key: process.env.VAULT_TOKEN_3 });
      vaultStatus = await vault.status();
      if (vaultStatus.sealed) {
        log(
          'error',
          'Unable to unseal vault',
        );
        throw new Error('Unable to unseal vault');
      }
    }

    const vaultData = await vault.read(`secret/alfred/${route}`);
    if (!isEmptyObject(vaultData.data)) {
      // eslint-disable-next-line no-prototype-builtins
      if (vaultData.data.hasOwnProperty(key)) return vaultData.data[key];
      throw new Error('No key found');
    }
    throw new Error('No key found');
  } catch (err) {
    log('error', err);
    return err;
  }
}
exports.vaultSecret = async (route, key) => {
  const secret = vaultSecret(route, key);
  return secret;
};

// Call another Alfred service
async function callAlfredServicePut(apiURL, body) {
  const ClientAccessKey = await vaultSecret(
    process.env.ENVIRONMENT,
    'ClientAccessKey',
  );

  const options = {
    method: 'PUT',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'client-access-key': ClientAccessKey,
      'api-trace-id': global.APITraceID,
    },
    body,
  };

  try {
    return await rp(options);
  } catch (err) {
    return err;
  }
}
exports.callAlfredServicePut = async (apiURL, body) => {
  const apiResponse = await callAlfredServicePut(apiURL, body);
  return apiResponse;
};

async function callAlfredServiceGet(apiURL) {
  const ClientAccessKey = await vaultSecret(
    process.env.ENVIRONMENT,
    'ClientAccessKey',
  );

  const options = {
    method: 'GET',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'client-access-key': ClientAccessKey,
      'api-trace-id': global.APITraceID,
    },
  };

  try {
    return await rp(options);
  } catch (err) {
    return err;
  }
}
exports.callAlfredServiceGet = async (apiURL) => {
  const apiResponse = await callAlfredServiceGet(apiURL);
  return apiResponse;
};

// Call 3rd party API
async function callAPIServicePut(apiURL, body) {
  const options = {
    method: 'POST',
    uri: apiURL,
    json: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  };

  try {
    return await rp(options);
  } catch (err) {
    log(
      'error',
      `Can not connect to 3rd party api service: ${err.message}`,
    );
    return err;
  }
}
exports.callAPIServicePut = async (apiURL, body) => {
  const apiResponse = await callAPIServicePut(apiURL, body);
  return apiResponse;
};

async function callAPIServiceGet(apiURL, body) {
  const options = {
    method: 'GET',
    uri: apiURL,
    json: true,
    body,
  };
  try {
    return rp(options);
  } catch (err) {
    log(
      'error',
      `Error calling: ${err.message}`,
    );
    log(
      'error',
      err.message,
    );
    return err;
  }
}
exports.callAPIService = async (apiURL, body) => {
  const apiResponse = await callAPIServiceGet(apiURL, body);
  return apiResponse;
};

// Construct and send JSON response back to caller
function sendResponse(res, status, dataObj) {
  let httpHeaderCode;
  let rtnData = dataObj;

  switch (status) {
    case 500: // Internal server error
      httpHeaderCode = 500;
      rtnData = { error: dataObj.message };
      break;
    case 400: // Invalid params
      httpHeaderCode = 400;
      rtnData = { error: dataObj.message };
      break;
    case 401: // Not authorised, invalid app_key
      httpHeaderCode = 401;
      break;
    case 404: // Resource not found
      httpHeaderCode = 404;
      break;
    default:
      httpHeaderCode = 200;
  }
  res.send(httpHeaderCode, rtnData); // Send response back to caller
}
exports.sendResponse = (res, status, dataObj) => {
  sendResponse(res, status, dataObj);
};

// Ping API
exports.ping = (res, next) => {
  log(
    'trace',
    'Ping API called',
  );
  const ackJSON = {
    reply: 'pong',
  };
  res.send(
    200,
    ackJSON,
  ); // Send response back to caller
  next();
};

// Lights
exports.getLightName = (param) => {
  const lightName = global.lightNames.filter(
    (o) => o.id.toString() === param.toString(),
  );
  if (lightName.length > 0) {
    return lightName[0].name;
  }
  return '[not defined]';
};

exports.getLightGroupName = (param) => {
  const lightGroupName = global.lightGroupNames.filter(
    (o) => o.id.toString() === param.toString(),
  );
  if (lightGroupName.length > 0) {
    return lightGroupName[0].name;
  }
  return '[not defined]';
};

exports.lightSceneXY = (scene) => {
  let xy;
  switch (scene) {
    case 1: // Sunrise
      xy = [0.2488, 0.2012];
      break;
    case 2: // Daytime
      xy = [0.3104, 0.3234];
      break;
    case 3: // Sunset
      xy = [0.4425, 0.4061];
      break;
    case 4: // Evening
      xy = [0.5015, 0.4153];
      break;
    case 5: // Nighttime
      xy = [0.5554, 0.3668];
      break;
    default:
      xy = [0.3104, 0.3234];
  }
  return xy;
};

// Get OS data
exports.getCpuInfo = () => {
  const load = os.loadavg();
  const cpu = {
    load1: load[0],
    load5: load[1],
    load15: load[2],
    cores: os.cpus().length,
  };
  cpu.utilization = Math.min(Math.floor((load[0] * 100) / cpu.cores), 100);
  return cpu;
};

exports.getMemoryInfo = () => {
  const mem = {
    free: os.freemem(),
    total: os.totalmem(),
  };
  mem.percent = (mem.free * 100) / mem.total;
  return mem;
};

exports.getOsInfo = () => {
  const osInfo = {
    uptime: os.uptime(),
    type: os.type(),
    release: os.release(),
    hostname: os.hostname(),
    arch: os.arch(),
    platform: os.platform(),
    user: os.userInfo(),
  };
  return osInfo;
};

exports.getProcessInfo = () => {
  const processInfo = {
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    argv: process.argv,
  };
  return processInfo;
};

// Geo location
exports.inHomeGeoFence = async function FnInHomeGeoFence(lat, long) {
  const geoHome = await vaultSecret(process.env.ENVIRONMENT, 'geoHome');
  const geoFenceHomeData = JSON.parse(geoHome);
  return geolib.isPointInPolygon(
    { latitude: lat, longitude: long },
    geoFenceHomeData,
  );
};

exports.inJPWorkGeoFence = async function FnInJPWorkGeoFence(lat, long) {
  const geoJPWork = await vaultSecret(process.env.ENVIRONMENT, 'geoJPWork');
  const geoFenceHomeData = JSON.parse(geoJPWork);
  return geolib.isPointInPolygon(
    { latitude: lat, longitude: long },
    geoFenceHomeData,
  );
};

// Database connection
exports.connectToDB = async (database) => {
  const DataStore = await vaultSecret(process.env.ENVIRONMENT, 'DataStore');
  const DataStoreUser = await vaultSecret(
    process.env.ENVIRONMENT,
    'DataStoreUser',
  );
  const DataStoreUserPassword = await vaultSecret(
    process.env.ENVIRONMENT,
    'DataStoreUserPassword',
  );
  const dataClient = new Client({
    host: DataStore,
    database,
    user: DataStoreUser,
    password: DataStoreUserPassword,
    port: 5432,
  });
  await dataClient.connect();
  return dataClient;
};

// Apple push notification connection
exports.connectToAPN = async () => {
  const IOSNotificationKeyID = await vaultSecret(
    process.env.ENVIRONMENT,
    'IOSNotificationKeyID',
  );
  const IOSNotificationTeamID = await vaultSecret(
    process.env.ENVIRONMENT,
    'IOSNotificationTeamID',
  );
  const IOSPushKey = await vaultSecret(process.env.ENVIRONMENT, 'IOSPushKey');
  const apnProvider = new apn.Provider({
    token: {
      key: IOSPushKey,
      keyId: IOSNotificationKeyID,
      teamId: IOSNotificationTeamID,
    },
    production: true,
  });
  return apnProvider;
};

// Check google cal to see if working from home
exports.workingFromHomeToday = async () => {
  let credentials = await vaultSecret(process.env.ENVIRONMENT, 'GoogleAPIKey');

  try {
    credentials = JSON.parse(credentials);

    // Configure a JWT auth client
    const jwtClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/calendar.events.readonly'],
    );

    // Authenticate request
    log(
      'trace',
      'Login to Google API',
    );
    await jwtClient.authorize();
    log(
      'trace',
      'Connected to Google API',
    );

    // Call Google Calendar API
    const googleAPICalendarID = await vaultSecret(
      process.env.ENVIRONMENT,
      'JPGoogleAPICalendarID',
    );
    const calendar = google.calendar('v3');
    log(
      'trace',
      'Check if working from home today',
    );
    const events = await calendar.events.list({
      auth: jwtClient,
      calendarId: googleAPICalendarID,
      timeMin: moment().clone().startOf('day').toISOString(),
      timeMax: moment().clone().endOf('day').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: 'JP work from home',
    });

    // Process calendar events
    if (events.data.items.length > 0) {
      log(
        'trace',
        'working from home today',
      );
      return true;
    }
    log(
      'trace',
      'Not working from home today',
    );
    return false;
  } catch (err) {
    log(
      'error',
      err.message,
    );
    return err;
  }
};

// JSON Schema validation functions
function schemaErrorResponse(schemaErrors) {
  const errors = schemaErrors.map((error) => ({
    path: error.dataPath,
    message: error.message,
  }));
  return {
    message: {
      inputValidation: 'failed',
      params: errors,
    },
  };
}

// eslint-disable-next-line arrow-body-style
exports.validateSchema = (schema) => {
  return (req, res, next) => {
    // const ajv = Ajv({ allErrors: true, removeAdditional: 'all' });
    const ajv = Ajv({ allErrors: true, strictDefaults: true });
    const valid = ajv.validate(schema, req.params);
    if (!valid) {
      log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      return sendResponse(
        res,
        400,
        schemaErrorResponse(ajv.errors),
      );
    }
    next();
    return true;
  };
};

// Check google cal to see if kids are staying
exports.kidsAtHomeToday = async () => {
  let credentials = await vaultSecret(process.env.ENVIRONMENT, 'GoogleAPIKey');

  try {
    credentials = JSON.parse(credentials);

    // Configure a JWT auth client
    const jwtClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/calendar.events.readonly'],
    );

    // Authenticate request
    log(
      'trace',
      'Login to Google API',
    );
    await jwtClient.authorize();
    log(
      'trace',
      'Connected to Google API',
    );

    // Call Google Calendar API
    const googleAPICalendarID = await vaultSecret(
      process.env.ENVIRONMENT,
      'GoogleAPICalendarID',
    );
    const calendar = google.calendar('v3');
    log(
      'trace',
      "Check if girls staying @ JP's today",
    );
    const events = await calendar.events.list({
      auth: jwtClient,
      calendarId: googleAPICalendarID,
      timeMin: moment().clone().startOf('day').toISOString(),
      timeMax: moment().clone().endOf('day').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: 'Girls @ JP',
    });

    // Process calendar events
    if (events.data.items.length > 0) {
      log(
        'trace',
        "Girls staying @ JP's today",
      );
      return true;
    }
    log(
      'trace',
      "Girls not staying @ JP's today",
    );
    return false;
  } catch (err) {
    log(
      'error',
      err.message,
    );
    return err;
  }
};

// Check today to see if it's a bank holiday or weekend
exports.checkForBankHolidayWeekend = async () => {
  log(
    'trace',
    'Check for bank holidays and weekends',
  );
  const url = 'https://www.gov.uk/bank-holidays.json';
  const toDay = new Date();
  const isWeekend = toDay.getDay() === 6 || toDay.getDay() === 0;

  if (isWeekend) {
    log(
      'trace',
      "It's the weekend",
    );
    return true;
  }

  const returnData = await callAPIServiceGet(url);
  if (returnData instanceof Error) {
    log(
      'trace',
      returnData.message,
    );
    return returnData;
  }

  let bankHolidays = [];
  try {
    bankHolidays = returnData['england-and-wales'].events;
    if (bankHolidays.length === 0) throw Error('No bank holiday data');
  } catch (err) {
    log(
      'error',
      err.message,
    );
    return err;
  }

  bankHolidays = bankHolidays.filter(
    (a) => a.date === dateFormat(toDay, 'yyyy-mm-dd'),
  );
  if (bankHolidays.length === 0) {
    log(
      'trace',
      "It's a weekday",
    );
    return false;
  }
  log(
    'trace',
    `It's ${bankHolidays[0].title}`,
  );
  return true;
};
