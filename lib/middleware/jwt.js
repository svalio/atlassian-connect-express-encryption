var jwt = require('jwt-simple');

module.exports = function (addon) {
    return function (req, res, next) {
        if (/no-auth/.test(process.env.AC_OPTS)) {
            return next();
        }
        var token = req.get('jwt');

        if (!token) {
            throw Error("No jwt token found on req " + req.toString());
        }

        var claims = jwt.decode(token, secret);
        return next();
    };
};
