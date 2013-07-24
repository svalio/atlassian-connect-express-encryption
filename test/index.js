// disable oauth verification during tests
process.env.AC_OPTS = 'no-oauth';

require('./config_test.js');
require('./descriptor_test.js');
require('./oauth_test.js');
require('./store_test.js');
require('./registration_test.js');
