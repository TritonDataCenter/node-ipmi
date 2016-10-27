/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_ipmi = require('../ipmi');
var lib_common = require('../common');

var PRIVILEGE_LEVELS = lib_ipmi.PRIVILEGE_LEVELS;

var lookup_ntov = lib_common.lookup_ntov;

module.exports = function () {
	return ({
		cmd_name: 'get_chan_auth_cap',
		cmd_code: 0x38,
		cmd_netfn: 'app',
		cmd_encoder: encode_get_chan_auth_cap,
		cmd_decoder: decode_get_chan_auth_cap,
		cmd_desc: 'Get Channel Authentication Capabilities',
		cmd_cc_extra: null,
	});
};

function
encode_get_chan_auth_cap(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 2;

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	var v2 = false;

	buf.writeUInt8((v2 ? 0x80 : 0x00) | 0xe, 0); /* 0xE is "this channel" */
	buf.writeUInt8(0xf & lookup_ntov(PRIVILEGE_LEVELS, 'administrator'), 1);

	return (datalen);
}

function
decode_get_chan_auth_cap(buf)
{
	var t;
	var pos = 0;

	var cac = {
		cac_auth_modes: []
	};

	cac.cac_channel = buf.readUInt8(pos);
	pos += 1;

	t = buf.readUInt8(pos);
	pos += 1;

	lib_common.bits_decode_object({
		cac_v2support: 0x80
	}, t, cac);

	lib_common.bits_decode_array({
		'none': 0x01,
		'md2': 0x02,
		'md5': 0x04,
		'password': 0x10,
		'oem': 0x20
	}, t, cac.cac_auth_modes);

	t = buf.readUInt8(pos);
	pos += 1;

	lib_common.bits_decode_object({
		cac_per_msg_auth: 0x10,
		cac_no_user_level_auth: 0x08,
		cac_usernames_exist: 0x04,
		cac_null_users_exist: 0x02,
		cac_anon_access: 0x01
	}, t, cac);

	return (cac);
}
