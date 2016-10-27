/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

module.exports = function () {
	return ({
		cmd_name: 'close_session',
		cmd_code: 0x3c,
		cmd_netfn: 'app',
		cmd_encoder: encode_close_session,
		cmd_decoder: decode_close_session,
		cmd_desc: 'Close Session',
		cmd_cc_extra: null,
	});
};

function
encode_close_session(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 4;

	mod_assert.number(extra.clss_session, 'clss_session');

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	var pos = 0;

	mod_assert.notStrictEqual(extra.clss_session, 0);
	buf.writeUInt32LE(extra.clss_session, pos);

	return (datalen);
}

function
decode_close_session(buf)
{
	if (buf.length !== 0) {
		throw (new Error('wrong length for reply'));
	}

	return ({});
}
