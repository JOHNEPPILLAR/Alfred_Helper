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
const restify = require('restify');
const UUID = require('pure-uuid');

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
  const originalStack = Error.prepareStackTrace;
  Error.stackTraceLimit = 4;
  Error.prepareStackTrace = function prepStack(_, stackTrace) { return stackTrace; };
  const err = new Error();
  const { stack } = err;
  Error.prepareStackTrace = originalStack;

  let returnStr;

  try {
    const fileName = path.basename(stack[3].getFileName());
    const functionName = stack[3].getFunctionName();
    const lineNumber = stack[3].getLineNumber();
    returnStr = `${fileName}:${functionName !== null ? ` ${functionName}` : ''}(${lineNumber})`;
  } catch (e) {
    returnStr = '[No trace data]';
  }
  return returnStr;
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
        child.info(`${message}`);
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
  const timeout = setTimeout(() => {
    const err = new Error('Timeout reached, not able to communicate with Vault');
    log(
      'error',
      err.message,
    );
    return err;
  }, 5000);

  try {
    const options = {
      apiVersion: 'v1',
      endpoint: process.env.VAULT_URL,
      token: process.env.VAULT_TOKEN,
    };
    // eslint-disable-next-line global-require
    const vault = require('node-vault')(options);

    // Check if vault is sealed
    const vaultStatus = await vault.status();
    if (vaultStatus.sealed) {
      log(
        'error',
        'Vault sealed',
      );
      process.exit(1); // Hard exit app
    }

    const vaultData = await vault.read(`secret/alfred/${route}`);
    if (timeout) clearTimeout(timeout);
    if (!isEmptyObject(vaultData.data)) {
      // eslint-disable-next-line no-prototype-builtins
      if (vaultData.data.hasOwnProperty(key)) return vaultData.data[key];
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
    return await rp(options);
  } catch (err) {
    log(
      'error',
      `Can not connect to 3rd party api service: ${err.message}`,
    );
    return err;
  }
}
exports.callAPIServiceGet = async (apiURL, body) => {
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
      rtnData = { error: dataObj };
      break;
    case 404: // Resource not found
      httpHeaderCode = 404;
      break;
    default:
      httpHeaderCode = 200;
  }
  res.json(httpHeaderCode, rtnData); // Send response back to caller
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
async function connectToDB(database) {
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
}
exports.connectToDB = async (database) => {
  const DBConn = connectToDB(database);
  return DBConn;
};

// Connect to google
async function getGoogleCal(query, calID) {
  try {
    let credentials = await vaultSecret(process.env.ENVIRONMENT, 'GoogleAPIKey');
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

    const googleAPICalendarID = await vaultSecret(
      process.env.ENVIRONMENT,
      calID,
    );
    log(
      'trace',
      `Check if ${query}`,
    );
    const calendar = google.calendar('v3');
    const events = await calendar.events.list({
      auth: jwtClient,
      calendarId: googleAPICalendarID,
      timeMin: moment().clone().startOf('day').toISOString(),
      timeMax: moment().clone().endOf('day').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: query,
    });
    return events.data.items;
  } catch (err) {
    log(
      'error',
      err.message,
    );
    return err;
  }
}

// Check google cal to see if working from home
exports.workingFromHomeToday = async () => {
  try {
    const events = await getGoogleCal('JP work from home', 'JPGoogleAPICalendarID');
    if (events instanceof Error) return events;

    // Process calendar events
    if (events.length > 0) {
      log(
        'trace',
        'Working from home today',
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

// Check google cal to see if kids are staying
exports.kidsAtHomeToday = async () => {
  try {
    const events = await getGoogleCal('Girls @ JP', 'GoogleAPICalendarID');
    if (events instanceof Error) return events;

    // Process calendar events
    if (events.length > 0) {
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

// Send iOS push notification to app
exports.sendPushNotification = async (notificationText) => {
  try {
    const deviceTokens = [];
    const pushSQL = 'SELECT last(device_token, time) as device_token FROM ios_devices';

    log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await connectToDB('devices');

    log(
      'trace',
      'Getting IOS devices',
    );
    const devicesToNotify = await dbConnection.query(pushSQL);

    log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    if (devicesToNotify.rowCount === 0) {
      log(
        'trace',
        'No devices to notify',
      );
      return;
    } // Exit function as no devices to process

    // Send iOS notifications what watering has started
    log(
      'trace',
      'Build list of devices to send push notification to',
    );
    devicesToNotify.rows.map((device) => deviceTokens.push(device.device_token));

    // Connect to apples push notification service and send notifications
    const IOSNotificationKeyID = await vaultSecret(
      process.env.ENVIRONMENT,
      'IOSNotificationKeyID',
    );
    const IOSNotificationTeamID = await vaultSecret(
      process.env.ENVIRONMENT,
      'IOSNotificationTeamID',
    );
    const IOSPushKey = await vaultSecret(
      process.env.ENVIRONMENT,
      'IOSPushKey',
    );
    if (IOSNotificationKeyID instanceof Error
      || IOSNotificationTeamID instanceof Error
      || IOSPushKey instanceof Error) {
      log(
        'error',
        'Not able to get secret (CERTS) from vault',
      );
      return;
    }

    const apnProvider = new apn.Provider({
      token: {
        key: IOSPushKey,
        keyId: IOSNotificationKeyID,
        teamId: IOSNotificationTeamID,
      },
      production: false,
    });

    log(
      'trace',
      'Send push notification(s)',
    );

    const notification = new apn.Notification();
    notification.topic = 'JP.Alfred';
    notification.expiry = Math.floor(Date.now() / 1000) + 600; // Expires 10 minutes from now.
    notification.alert = notificationText;
    const result = await apnProvider.send(
      notification,
      deviceTokens,
    );

    if (result.sent.length > 0) {
      log(
        'info',
        'Push notification sent',
      );
    } else {
      log(
        'error',
        'Push notification faild to be sent',
      );
    }

    log(
      'trace',
      'Close down connection to push notification service',
    );
    await apnProvider.shutdown(); // Close the connection with apn
  } catch (err) {
    log(
      'error',
      err.message,
    );
  }
};

// Setup restify server
exports.setupRestifyServer = async (virtualHost, version) => {
  try {
    // Restify server Init
    log('trace', 'Getting certs');
    const key = await vaultSecret(
      process.env.ENVIRONMENT,
      `${virtualHost}_key`,
    );
    const certificate = await vaultSecret(
      process.env.ENVIRONMENT,
      `${virtualHost}_cert`,
    );

    if (key instanceof Error || certificate instanceof Error) {
      log(
        'error',
        'Not able to get secret (CERTS) from vault',
      );
      log(
        'warn',
        'Exit the app',
      );
      process.exit(1); // Exit app
    }

    const server = restify.createServer({
      name: virtualHost,
      version,
      key,
      certificate,
    });
    return server;
  } catch (err) {
    log(
      'error',
      err.message,
    );
    return err;
  }
};

// Middleware
exports.setupRestifyMiddleware = (server, virtualHost) => {
  try {
    server.on('NotFound', (req, res, err) => {
      log(
        'error',
        err.message,
      );
      sendResponse(
        res,
        404,
        { error: err.message },
      );
    });
    server.use(restify.plugins.jsonBodyParser({ mapParams: true }));
    server.use(restify.plugins.acceptParser(server.acceptable));
    server.use(restify.plugins.queryParser({ mapParams: true }));
    server.use(restify.plugins.fullResponse());
    server.use((req, res, next) => {
      log(
        'trace',
        `URL: ${req.url}`,
      );
      if (typeof req.params !== 'undefined' && req.params !== null) {
        log(
          'trace',
          `Params: ${JSON.stringify(req.params)}`,
        );
      }
      if (!isEmptyObject(req.query)) {
        log(
          'trace',
          `Query: ${JSON.stringify(req.query)}`,
        );
      }
      if (typeof req.body !== 'undefined' && req.body !== null) {
        log(
          'trace',
          `Body: ${JSON.stringify(req.body)}`,
        );
      }

      // Set response headers
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self' ${virtualHost}`,
      );
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
      res.setHeader(
        'X-Frame-Options',
        'SAMEORIGIN',
      );
      res.setHeader(
        'X-XSS-Protection',
        '1; mode=block',
      );
      res.setHeader(
        'X-Content-Type-Options',
        'nosniff',
      );
      res.setHeader(
        'Referrer-Policy',
        'no-referrer',
      );
      next();
    });
    server.use(async (req, res, next) => {
      // Check for a trace id
      if (typeof req.headers['api-trace-id'] === 'undefined') {
        global.APITraceID = new UUID(4);
      } else {
        global.APITraceID = req.headers['api-trace-id'];
      }

      // Check for valid auth key
      const ClientAccessKey = await vaultSecret(
        process.env.ENVIRONMENT,
        'ClientAccessKey',
      );
      if (ClientAccessKey instanceof Error) {
        log(
          'error',
          ClientAccessKey.message,
        );
        log(
          'error',
          'Not able to get secret (ClientAccessKey) from vault',
        );
        sendResponse(
          res,
          500,
          new Error('There was a problem with the auth service'),
        );
        return;
      }
      if (req.headers['client-access-key'] !== ClientAccessKey
        && req.query.clientaccesskey !== ClientAccessKey) {
        // No key, send error back to caller
        log(
          'warn',
          'No or invaid client access key',
        );
        sendResponse(
          res,
          401,
          'There was a problem authenticating you',
        );
        return;
      }
      next();
    });
  } catch (err) {
    log(
      'error',
      err.message,
    );
  }
};

// Capture and process api server errors
exports.captureRestifyServerErrors = (server) => {
  // Stop server if process close event is issued
  function cleanExit() {
    log(
      'warn',
      'Service stopping',
    );
    log(
      'trace',
      'Close rest server',
    );
    server.close(() => {
      log(
        'info',
        'Exit the app',
      );
      process.exit(1); // Exit app
    });
  }
  process.on('SIGINT', () => {
    cleanExit();
  });
  process.on('SIGTERM', () => {
    cleanExit();
  });
  process.on('SIGUSR2', () => {
    cleanExit();
  });
  process.on('uncaughtException', (err) => {
    log(
      'error',
      err.message,
    ); // log the error
  });
  process.on('unhandledRejection', (reason, p) => {
    log(
      'error',
      `Unhandled Rejection at Promise: ${p} - ${reason}`,
    ); // log the error
  });
};
