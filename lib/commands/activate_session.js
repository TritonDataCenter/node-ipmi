/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_ipmi = require('../ipmi');
var lib_common = require('../common');

var AUTHTYPES = lib_ipmi.AUTHTYPES;
var PRIVILEGE_LEVELS = lib_ipmi.PRIVILEGE_LEVELS;

var lookup_ntov = lib_common.lookup_ntov;
var lookup_vton = lib_common.lookup_vton;

module.exports = function () {
	return ({
		cmd_name: 'activate_session',
		cmd_code: 0x3a,
		cmd_netfn: 'app',
		cmd_encoder: encode_activate_session,
		cmd_decoder: decode_activate_session,
		cmd_desc: 'Activate Session',
		cmd_cc_extra: null,
	});
};

function
encode_activate_session(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 22;

	mod_assert.string(extra.acts_authtype, 'acts_authtype');
	mod_assert.number(extra.acts_seqno);
	mod_assert.ok(Buffer.isBuffer(extra.acts_challenge));
	mod_assert.strictEqual(extra.acts_challenge.length, 16);
	mod_assert.string(extra.acts_privilege, 'acts_privilege');

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	var pos = 0;

	buf.writeUInt8(lookup_ntov(AUTHTYPES, extra.acts_authtype, pos));
	pos += 1;

	buf.writeUInt8(lookup_ntov(PRIVILEGE_LEVELS, extra.acts_privilege),
	    pos);
	pos += 1;

	pos += extra.acts_challenge.copy(buf, pos);

	buf.writeUInt32LE(extra.acts_seqno, pos);
	pos += 4;

	return (datalen);
}

function
decode_activate_session(buf)
{
	if (buf.length !== 10) {
		throw (new Error('wrong length for reply'));
	}

	var pos = 0;

	var authtype = lookup_vton(AUTHTYPES, buf.readUInt8(pos) & 0xf);
	pos += 1;

	var session = buf.readUInt32LE(pos);
	pos += 4;

	var init_seq = buf.readUInt32LE(pos);
	pos += 4;

	var priv = buf.readUInt8(pos) & 0xf;
	pos += 1;

	return ({
		acts_authtype: authtype,
		acts_session: session,
		acts_seq_no: init_seq,
		acts_privilege: priv
	});
}
