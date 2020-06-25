/**
 * Import external libraries
 */
const moment = require('moment');

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

function getSortOrder(prop) {
  const obj = function AB(a, b) {
    if (a[prop] > b[prop]) {
      return 1;
    }
    if (a[prop] < b[prop]) return -1;
    return 0;
  };
  return obj;
}

function timeDiff(startTime, timeFromNow, addMinutes, displayHrs) {
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
}

function zeroFill(number, width) {
  const pad = width - number.toString().length;
  if (pad > 0) {
    return new Array(pad + (/\./.test(number) ? 2 : 1)).join('0') + number;
  }
  return `${number}`; // always return a string
}

module.exports = {
  // Generial helper functions
  isEmptyObject,
  getSortOrder,
  timeDiff,
  zeroFill,
};
