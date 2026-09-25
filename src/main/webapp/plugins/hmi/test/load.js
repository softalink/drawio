// Loads HMI modules into globalThis.Hmi for Node unit tests.
// Usage: var Hmi = require('./load.js')(['core/HmiExpr.js', ...]);
var path = require('path');

module.exports = function load(files)
{
	for (var i = 0; i < files.length; i++)
	{
		require(path.join(__dirname, '..', files[i]));
	}

	return globalThis.Hmi;
};
