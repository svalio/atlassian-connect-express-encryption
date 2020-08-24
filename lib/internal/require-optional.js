exports.requireOptional = function requireOptional(moduleName) {
  return new Promise((resolve, reject) => {
    try {
      resolve(require(moduleName));
    } catch (err) {
      reject(err);
    }
  });
};
