/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_common = require('../common');

module.exports = function () {
	return ({
		cmd_name: 'get_system_guid',
		cmd_code: 0x37,
		cmd_netfn: 'app',
		cmd_encoder: encode_get_system_guid,
		cmd_decoder: decode_get_system_guid,
		cmd_desc: 'Get System GUID',
		cmd_cc_extra: null,
	});
};

function
encode_get_system_guid(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 0;

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	return (datalen);
}

function
decode_get_system_guid(buf)
{
	var a = buf.toString('hex');

	var gsgi = {
		gsgi_uuid: [
			a.substr(0, 8),
			a.substr(8, 4),
			a.substr(12, 4),
			a.substr(16, 4),
			a.substr(20, 12)
		].join('-')
	};

	/*
	 * XXX NB: there could be byte-ordering problems with this UUID.  At
	 * the moment it seems to match what we get out of "smbios -t 1" on
	 * SmartOS, but it's possible we aren't doing the right thing with
	 * SMBIOS there.
	 */

	return (gsgi);
}
