// disable logging and oauth verification during tests
process.env.FEEBS_OPTS = 'test nooauth';

require('./config_test.js');
require('./descriptor_test.js');
require('./oauth_test.js');
require('./registration_test.js');
