/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

module.exports = function () {
	return ({
		cmd_name: 'get_session_info',
		cmd_code: 0x3d,
		cmd_netfn: 'app',
		cmd_encoder: encode_get_session_info,
		cmd_decoder: decode_get_session_info,
		cmd_desc: 'Get Session Info',
		cmd_cc_extra: null,
	});
};

function
encode_get_session_info(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 1;

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	var pos = 0;

	/*
	 * Session Index.  This value may be interpreted in several ways:
	 *	0	this session
	 *	N	session in slot N
	 *	0xFE	look up session according to session handle (next byte)
	 *	0xFF	look up session according to session ID (next 4 bytes)
	 */
	buf.writeUInt8(0, pos);
	pos += 1;

	return (datalen);
}

function
decode_get_session_info(buf)
{
	return ({});
}
