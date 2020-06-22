/**
 * Import external libraries
 */
const rp = require('request-promise');
const Ajv = require('ajv');

//const geolib = require('geolib');
//const moment = require('moment');
//const dateFormat = require('dateformat');
//const apn = require('apn');
//const { google } = require('googleapis');

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

function validateSchema(req, schema) {
  const ajv = Ajv({ allErrors: true, strictDefaults: true });
  const valid = ajv.validate(schema, req.params);
  if (!valid) {
    this.logger.trace(
      `${this.traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
    );
    return schemaErrorResponse(ajv.errors);
  }
  return true;
}

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
  validateSchema,
  // Get data from APIs
  callAPIServiceGet,
  callAlfredServiceGet,
};
