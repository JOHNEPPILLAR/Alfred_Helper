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
  // if (typeof obj !== 'object') return true;
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
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

function zeroFill(number, width) {
  const pad = width - number.toString().length;
  if (pad > 0) {
    return new Array(pad + (/\./.test(number) ? 2 : 1)).join('0') + number;
  }
  return `${number}`; // always return a string
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

function addDays(date, amount) {
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
}

function addTime(startTime, timeToAdd) {
  try {
    let newEndTime = moment();
    if (startTime !== null) newEndTime = moment(startTime, 'HH:mm');
    if (typeof timeToAdd === 'undefined') return startTime;
    newEndTime.add(timeToAdd, 'minutes');
    return newEndTime.format('HH:mm');
  } catch (err) {
    return startTime;
  }
}

module.exports = {
  // Generial helper functions
  isEmptyObject,
  getSortOrder,
  timeDiff,
  zeroFill,
  addDays,
  addTime,
};
