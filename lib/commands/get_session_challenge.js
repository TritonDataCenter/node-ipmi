/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_ipmi = require('../ipmi');
var lib_common = require('../common');

var AUTHTYPES = lib_ipmi.AUTHTYPES;

var lookup_ntov = lib_common.lookup_ntov;

module.exports = function () {
	return ({
		cmd_name: 'get_session_challenge',
		cmd_code: 0x39,
		cmd_netfn: 'app',
		cmd_encoder: encode_get_session_challenge,
		cmd_decoder: decode_get_session_challenge,
		cmd_desc: 'Get Session Challenge',
		cmd_cc_extra: null,
	});
};

function
encode_get_session_challenge(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 17;

	mod_assert.string(extra.chal_authtype, 'chal_authtype');
	mod_assert.ok(extra.chal_username.length < 16, 'username too long');

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	buf.writeUInt8(lookup_ntov(AUTHTYPES, extra.chal_authtype), 0);
	buf.fill(0, 1, buf.length);
	buf.write(extra.chal_username, 1, extra.chal_username.length, 'ascii');

	return (datalen);
}

function
decode_get_session_challenge(buf)
{
	if (buf.length !== 20) {
		throw (new Error('session challenge wrong length'));
	}

	return ({
		chal_session: buf.readUInt32LE(0),
		chal_challenge: buf.slice(4)
	});
}

