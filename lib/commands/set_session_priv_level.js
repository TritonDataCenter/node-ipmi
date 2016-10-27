/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_ipmi = require('../ipmi');
var lib_common = require('../common');

var PRIVILEGE_LEVELS = lib_ipmi.PRIVILEGE_LEVELS;

module.exports = function () {
	return ({
		cmd_name: 'set_session_priv_level',
		cmd_code: 0x3b,
		cmd_netfn: 'app',
		cmd_encoder: encode_set_session_priv_level,
		cmd_decoder: decode_set_session_priv_level,
		cmd_desc: 'Set Session Privilege Level',
		cmd_cc_extra: null,
	});
};

function
encode_set_session_priv_level(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 1;

	var priv = 0;
	if (extra.sspl_level !== null) {
		mod_assert.string(extra.sspl_level, 'sspl_level');
		priv = lib_common.lookup_ntov(PRIVILEGE_LEVELS,
		    extra.sspl_level);

		if (priv < 2 || priv > 5) {
			/*
			 * We can only set USER, OPERATOR, ADMINISTRATOR or OEM
			 * as the level through this command.  The other levels
			 * (CALLBACK, NONE) cannot be expressed through this
			 * protocol message.
			 */
			throw (new Error('cannot set privilege level "' +
			    extra.sspl_level + '"'));
		}
	}

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	var pos = 0;

	buf.writeUInt8(0xf & priv, 0);
	pos += 1;

	return (datalen);
}

function
decode_set_session_priv_level(buf)
{
	if (buf.length !== 1) {
		throw (new Error('invalid message length'));
	}

	return ({
		sspl_level: lib_common.lookup_vton(PRIVILEGE_LEVELS,
		    buf.readUInt8(0))
	});
}
