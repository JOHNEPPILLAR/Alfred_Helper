/**
 * Import external libraries
 */
const pino = require('pino');
const rp = require('request-promise');
const os = require('os');
const path = require('path');
const geolib = require('geolib');
const fs = require('fs');
const moment = require('moment');
const dateFormat = require('dateformat');

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
    if (typeof addTime === 'undefined') {
      return startTime;
    }
    // const newAddTime = moment.duration(addTime);
    newEndTime.add(addTime, 'minutes');
    return newEndTime.format('HH:mm');
  } catch (err) {
    return startTime;
  }
};

exports.timeDiff = (startTime, timeFromNow, addMinutes, displayHrs) => {
  let newStartTime = moment();
  if (startTime !== null) newStartTime = moment(startTime, 'HH:mm');
  const newEndTime = moment(timeFromNow, 'HH:mm');

  if (newStartTime.isAfter(newEndTime)) newEndTime.add(1, 'days');

  let addMinutesToTime = 0;
  if (typeof addMinutes !== 'undefined') addMinutesToTime = addMinutes;
  newEndTime.add(addMinutesToTime, 'minutes');

  let minutes = newEndTime.diff(newStartTime, 'minutes');
  if (minutes < 0) minutes = 0;
  let returnString = `${minutes}`;

  if (displayHrs) {
    let hours = newStartTime.diff(newEndTime, 'hours');
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
  return dateFormat(timeNow, 'h:MM TT');
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
    if (process.env.Environment === 'development') {
      logger = pino({
        level: 'trace',
        prettyPrint: {
          levelFirst: true,
        },
      });
    } else {
      logger = pino();
    }
    let child = logger.child({ index: 'log', 'trace-id': `${global.APITraceID}` });

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

// Call another Alfred service
async function callAlfredServicePut(apiURL, body) {
  const options = {
    method: 'PUT',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'client-access-key': process.env.ClientAccessKey,
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
  const options = {
    method: 'GET',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'client-access-key': process.env.ClientAccessKey,
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
    log('error', `Can not connect to 3rd party api service: ${err.message}`);
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
    log('error', `Error calling: ${err.message}`);
    log('error', err.message);
    return err;
  }
}
exports.callAPIService = async (apiURL, body) => {
  const apiResponse = await callAPIServiceGet(apiURL, body);
  return apiResponse;
};

// Construct and send JSON response back to caller
exports.sendResponse = (res, status, dataObj) => {
  let httpHeaderCode;
  let rtnData = dataObj;

  switch (status) {
    case 500: // Internal server error
      httpHeaderCode = 500;
      rtnData = dataObj.message;
      break;
    case 400: // Invalid params
      httpHeaderCode = 400;
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

  const returnJSON = {
    data: rtnData,
  };

  res.send(httpHeaderCode, returnJSON); // Send response back to caller
};

// Ping API
exports.ping = (res, next) => {
  log('trace', 'Ping API called');

  const ackJSON = {
    reply: 'pong',
  };
  res.send(200, ackJSON); // Send response back to caller
  next();
};

// Lights
exports.getLightName = (param) => {
  const lightName = global.lightNames.filter((o) => o.id.toString() === param.toString());
  if (lightName.length > 0) {
    return lightName[0].name;
  }
  return '[not defined]';
};

exports.getLightGroupName = (param) => {
  const lightGroupName = global.lightGroupNames.filter((o) => o.id.toString() === param.toString());
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
exports.inHomeGeoFence = function FnInHomeGeoFence(lat, long) {
  const geoHomeFile = './geoHome.json';
  const geoFenceHomeData = JSON.parse(fs.readFileSync(geoHomeFile, 'utf8'));
  return geolib.isPointInPolygon({ latitude: lat, longitude: long }, geoFenceHomeData);
};

exports.inJPWorkGeoFence = function FnInJPWorkGeoFence(lat, long) {
  const geoJPWorkFile = './geoJPWork.json';
  const geoFenceHomeData = JSON.parse(fs.readFileSync(geoJPWorkFile, 'utf8'));
  return geolib.isPointInPolygon({ latitude: lat, longitude: long }, geoFenceHomeData);
};

// Vault
exports.vaultSecret = async function FnVaultSecret(route, key) {
  try {
    const options = {
      apiVersion: 'v1',
      endpoint: process.env.vaultURL,
      token: process.env.vaultToken,
    };
    // eslint-disable-next-line global-require
    const vault = require('node-vault')(options);
    log('trace', 'Connected to Vault');
    const vaultData = await vault.read(`secret/alfred/${route}`);
    if (!isEmptyObject(vaultData.data)) {
      log('trace', 'Vault returned some data');
      // eslint-disable-next-line no-prototype-builtins
      if (vaultData.data.hasOwnProperty(key)) {
        log('trace', `Vault secret: ${vaultData.data[key]}`);
        return vaultData.data[key][0];
      }
      log('trace', 'Secret not found');
      return '';
    }
    log('trace', 'Vault data is empty');
    return '';
  } catch (err) {
    log(err);
    return '';
  }
};
