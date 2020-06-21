/**
 * Import external libraries
 */
const rp = require('request-promise');

//const { Client } = require('pg');
//const geolib = require('geolib');
//const moment = require('moment');
//const dateFormat = require('dateformat');
//const apn = require('apn');
//const { google } = require('googleapis');
//const Ajv = require('ajv');

/** *************************
 * Generial helper functions
 ************************* */

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

/** *************************
 * Get data from APIs
 ************************* */

async function callAPIServiceGet(apiURL) {
  const options = {
    method: 'GET',
    uri: apiURL,
    json: true,
  };
  try {
    return await rp(options);
  } catch (err) {
    return err;
  }
}

async function callAlfredServiceGet(apiURL) {
  const options = {
    method: 'GET',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'client-access-key': this.apiAccessKey,
    },
  };

  try {
    return await rp(options);
  } catch (err) {
    return new Error(`Error response - ${err.error.error}`);
  }
}

module.exports = {
  // Generial helper functions
  isEmptyObject,
  // Get data from APIs
  callAPIServiceGet,
  callAlfredServiceGet,
};
