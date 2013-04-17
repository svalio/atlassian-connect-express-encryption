module.exports = function (plugin) {
  // chain global middleware together as needed
  return require("./request")(plugin);
};
