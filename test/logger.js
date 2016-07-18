function nop() {}

module.exports = {
  info: nop,
  warn: nop,
  error: console.log
};
