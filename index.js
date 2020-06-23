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

module.exports = {
  // Generial helper functions
  isEmptyObject,
};
