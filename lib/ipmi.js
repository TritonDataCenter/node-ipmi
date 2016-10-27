/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');
var mod_crypto = require('crypto');
var mod_path = require('path');
var mod_fs = require('fs');

var lib_common = require('./common');

/*
 * From: 5.1 Network Function Codes:
 */
var NETFNS = [
	{ v: 0x00, n: 'chassis:req' },
	{ v: 0x01, n: 'chassis:res' },
	{ v: 0x02, n: 'bridge:req' },
	{ v: 0x03, n: 'bridge:res' },
	{ v: 0x04, n: 'sensor:req' },
	{ v: 0x05, n: 'sensor:res' },
	{ v: 0x06, n: 'app:req' },
	{ v: 0x07, n: 'app:res' },
	{ v: 0x08, n: 'firmware:req' },
	{ v: 0x09, n: 'firmware:res' },
];

/*
 * From: 5.2 Completion Codes:
 */
var COMPLETION_CODES = [
	{ v: 0x00, n: 'success' },
	{ v: 0xc0, n: 'busy' },
	{ v: 0xc1, n: 'invalid command' },
	{ v: 0xc2, n: 'command invalid for LUN' },
	{ v: 0xc3, n: 'command processing timeout' },
	{ v: 0xc4, n: 'out of space' },
	{ v: 0xc5, n: 'reservation cancelled or ID invalid' },
	{ v: 0xc6, n: 'request data truncated' },
	{ v: 0xc7, n: 'request data length invalid' },
	{ v: 0xc8, n: 'request data field length limited exceeded' },
	{ v: 0xc9, n: 'paramater out of range' },
	{ v: 0xca, n: 'cannot return number of requested data bytes' },
	{ v: 0xcb, n: 'requested sensor/data/record not present' },
	{ v: 0xcc, n: 'invalid data field in request' },
	{ v: 0xcd, n: 'illegal command for sensor/record type' },
	{ v: 0xce, n: 'command response could not be provided' },
	{ v: 0xcf, n: 'cannot execute duplicated request' },
	{ v: 0xd0, n: 'command response could not be provided: ' +
	    'SDR repository in update mode' },
	{ v: 0xd1, n: 'command response could not be provided: ' +
	    'device in firmware update mode' },
	{ v: 0xd2, n: 'command response could not be provided: ' +
	    'BMC initialisation in progress' },
	{ v: 0xd3, n: 'destination unavailable' },
	{ v: 0xd4, n: 'insufficient privilege or other security issue' },
	{ v: 0xd5, n: 'cannot execute command; not supported in ' +
	    'present state' },
	{ v: 0xd6, n: 'cannot execute command; parameter is illegal ' +
	    'because sub-function disabled or unavailable' },
	{ v: 0xff, n: 'unspecified' },
];

var AUTHTYPES = [
	{ v: 0, n: 'none' },
	{ v: 1, n: 'md2' },
	{ v: 2, n: 'md5' },
	{ v: 4, n: 'password' },
	{ v: 5, n: 'oem' },
	{ v: 6, n: 'rmcp+', e: 'IPMI 2.0 not yet implemented' },
];

var PRIVILEGE_LEVELS = [
	{ v: 0, n: 'none' },
	{ v: 1, n: 'callback' },
	{ v: 2, n: 'user' },
	{ v: 3, n: 'operator' },
	{ v: 4, n: 'administrator' },
	{ v: 5, n: 'oem' },
];

/*
 * Commands will be loaded from modules in "lib/commands/*.js".
 */
var COMMANDS;

function
load_commands()
{
	mod_assert.ok(!COMMANDS);
	COMMANDS = [];

	var ents = mod_fs.readdirSync(mod_path.join(__dirname, 'commands'));

	for (var i = 0; i < ents.length; i++) {
		var ent = ents[i];

		if (ent.match(/\.js$/)) {
			var cmd = require('./commands/' + ent)();

			mod_assert.strictEqual(ent, cmd.cmd_name + '.js');

			COMMANDS.push(cmd);
		}
	}
}

function
cmd_lookup_code(netfn, c)
{
	for (var i = 0; i < COMMANDS.length; i++) {
		var cmd = COMMANDS[i];

		if (cmd.cmd_netfn === netfn && cmd.cmd_code === c)
			return (cmd);
	}

	throw (new Error('unknown command netfn "' + netfn + '" code "' +
	    c + '"'));
}

function
cmd_lookup_name(n)
{
	for (var i = 0; i < COMMANDS.length; i++) {
		var cmd = COMMANDS[i];

		if (cmd.cmd_name === n)
			return (cmd);
	}

	throw (new Error('unknown command "' + n + '"'));
}

var DESC = [
	{ n: 'ipmi_authtype', lt: AUTHTYPES, t: 'u8' },
	{ n: 'ipmi_sequence', t: 'u32le' },
	{ n: 'ipmi_session_id', t: 'u32le' },
	{ n: 'ipmi_auth_code', t: 'buf', len: 16, 
	    onlyif: function (out) {
		return (out.ipmi_authtype !== 'none');
	    }},
	{ i: true, n: 'ipmi_len', t: 'u8', lenfor: 'ipmi_data' },
	{ n: 'ipmi_data', t: 'buf', lenfrom: 'ipmi_len' },
];

function
encode_packet(input)
{
	return (encode_packet_desc(input, DESC));
}

function
encode_packet_desc(input, desc)
{
	/*
	 * Calculate the required Buffer length:
	 */
	var len = 0;

	for (var i = 0; i < desc.length; i++) {
		var d = desc[i];

		if (d.onlyif && !d.onlyif(input)) {
			continue;
		}

		switch (d.t) {
		case 'u8':
			len += 1;
			break;

		case 'u32le':
			len += 4;
			break;

		case 'buf':
			mod_assert.ok(Buffer.isBuffer(input[d.n]));
			len += input[d.n].length;
			break;

		default:
			throw (new Error('invalid d.t: ' + d.t));
		}
	}

	var pos = 0;
	var out = new Buffer(len);
	out.fill(0);

	for (var i = 0; i < desc.length; i++) {
		var d = desc[i];

		if (d.onlyif && !d.onlyif(input)) {
			continue;
		}

		var nv = null;
		switch (d.t) {
		case 'u8':
		case 'u32le':
			if (d.i) {
				mod_assert.string(d.lenfor, 'd.lenfor');
				mod_assert.ok(Buffer.isBuffer(input[d.lenfor]));

				nv = input[d.lenfor].length;
			} else if (d.lt) {
				mod_assert.string(input[d.n], d.n);

				nv = lib_common.lookup_ntov(d.lt, input[d.n]);
			} else {
				mod_assert.number(input[d.n], d.n);

				nv = input[d.n];
			}
			break;
		}

		switch (d.t) {
		case 'u8':
			mod_assert.number(nv);
			out.writeUInt8(nv, pos);
			pos += 1;
			break;

		case 'u32le':
			mod_assert.number(nv);
			out.writeUInt32LE(nv, pos);
			pos += 4;
			break;

		case 'buf':
			mod_assert.ok(Buffer.isBuffer(input[d.n]));
			pos += input[d.n].copy(out, pos);
			break;

		default:
			throw (new Error('invalid d.t: ' + d.t));
		}
	}

	return (out);
}

function
decode_packet(buf)
{
	return (decode_packet_desc(buf, DESC));
}

function
decode_packet_desc(buf, desc)
{
	var pos = 0;
	var out = {};
	var internal = {};

	for (var i = 0; i < desc.length; i++) {
		var d = desc[i];
		var v = null;

		if (d.onlyif && !d.onlyif(out)) {
			continue;
		}

		switch (d.t) {
		case 'u8':
			v = buf.readUInt8(pos);
			pos += 1;
			break;

		case 'u32le':
			v = buf.readUInt32LE(pos);
			pos += 4;
			break;

		case 'buf':
			var len;
			if (d.len)
				len = d.len;
			else if (d.lenfrom)
				len = internal[d.lenfrom] || out[d.lenfrom];

			if (!len)
				throw (new Error('req len'));

			v = buf.slice(pos, pos + len);
			pos += len;
			break;

		default:
			throw (new Error('invalid d.t: ' + d.t));
		}

		if (d.lt) {
			v = lib_common.lookup_vton(d.lt, v);
		}

		if (d.i) {
			internal[d.n] = v;
		} else {
			out[d.n] = v;
		}
	}

	return (out);
}

/*
 * Implements Multi-session AuthCode calculation.
 *
 * From: 22.17.1 AuthCode Algorithms.
 */
function
authcode_multi(type, password, session_id, data, seq_no)
{
	var ret;

	switch (type) {
	case 'password':
		ret = authcode_multi_password(password);
		break;

	case 'md5':
		ret = authcode_multi_md5(password, session_id, data, seq_no);
		break;

	default:
		throw (new Error('invalid auth type: ' + type));
	}

	mod_assert.ok(Buffer.isBuffer(ret));
	mod_assert.strictEqual(ret.length, 16);
	return (ret);
}

function
authcode_multi_password(password)
{
	mod_assert.string(password, 'password');
	mod_assert.ok(password.length <= 16, 'password too long');

	var passbuf = new Buffer(16);
	passbuf.fill(0);
	passbuf.write(password, 0);

	return (passbuf);
}

function
authcode_multi_md5(password, session_id, data, seq_no)
{
	var passbuf = new Buffer(16);
	passbuf.fill(0);
	passbuf.write(password, 0);

	var intbuf = new Buffer(4);

	var sum = mod_crypto.createHash('md5');

	sum.update(passbuf);

	intbuf.writeUInt32LE(session_id);
	sum.update(intbuf);

	sum.update(data);

	if (typeof (seq_no) === 'number') {
		intbuf.writeUInt32LE(seq_no);
		sum.update(intbuf);
	}

	sum.update(passbuf);

	return (sum.digest());
}

function
nonsense_checksum(buf, start, len)
{
	var out = 0;

	for (var i = 0; i < len; i++) {
		out = (out + buf[i + start]) & 0xff;
	}

	return ((-out) & 0xff);
}

function
construct(ipmb)
{
	mod_assert.object(ipmb);
	mod_assert.string(ipmb.ipmb_cmd, 'ipmb.ipmb_cmd');

	var cmd = cmd_lookup_name(ipmb.ipmb_cmd);
	var datalen = cmd.cmd_encoder(ipmb.ipmb_type, ipmb.ipmb_extra, null);

	var buf = new Buffer(7 + datalen);
	var pos = 0;
	var sumstart = 0;

	/*
	 * Responder (Destination) Address
	 */
	mod_assert.number(ipmb.ipmb_res_addr, 'ipmb_res_addr');
	buf.writeUInt8(ipmb.ipmb_res_addr, pos);
	pos += 1;

	/*
	 * Responder LUN / Network Function
	 */
	mod_assert.number(ipmb.ipmb_res_lun, 'ipmb_res_lun');
	mod_assert.string(ipmb.ipmb_type, 'ipmb_type');
	buf.writeUInt8(encode_netfn(ipmb.ipmb_type, cmd.cmd_netfn,
	    ipmb.ipmb_res_lun), pos);
	pos += 1;

	/*
	 * Checksum #1
	 */
	buf.writeUInt8(nonsense_checksum(buf, sumstart, pos - sumstart), pos);
	pos += 1;
	sumstart = pos;

	/*
	 * Requestor (Source) Address
	 */
	mod_assert.number(ipmb.ipmb_req_addr, 'ipmb_req_addr');
	buf.writeUInt8(ipmb.ipmb_req_addr, pos);
	pos += 1;

	/*
	 * Requestor LUN / Sequence Number
	 */
	mod_assert.number(ipmb.ipmb_req_lun, 'ipmb_req_lun');
	mod_assert.number(ipmb.ipmb_seqno, 'ipmb_seqno');
	buf.writeUInt8(ipmb.ipmb_req_lun & 0x3 |
	    ((0x3f & ipmb.ipmb_seqno) << 2), pos);
	pos += 1;

	/*
	 * Command
	 */
	buf.writeUInt8(cmd.cmd_code, pos);
	pos += 1;

	/*
	 * Data
	 */
	cmd.cmd_encoder(ipmb.ipmb_type, ipmb.ipmb_extra, buf.slice(pos,
	    pos + datalen));
	pos += datalen;

	/*
	 * Checksum #2
	 */
	buf.writeUInt8(nonsense_checksum(buf, sumstart, pos - sumstart), pos);
	pos += 1;
	sumstart = pos;

	return (buf);
}

function
encode_netfn(type, name, lun)
{
	mod_assert.ok(lun >= 0 && lun <= 3, 'LUN must be 0-3');
	mod_assert.ok(type === 'req' || type === 'res', 'type');

	var netfn = lib_common.lookup_ntov(NETFNS, name + ':' + type);

	return ((lun & 0x3) | (netfn << 2));
}

function
decode_netfn(byt)
{
	var netfn = (byt & 0xff) >> 2;
	var tup = lib_common.lookup_vton(NETFNS, netfn).split(':');

	return ({
		n: tup[0],
		t: tup[1],
		l: (byt & 0x3)
	});
}

/*
 * From: 13.8 IPMI LAN Message Format
 */
function
decode_inner(buf)
{
	var t;

	var req_addr = buf.readUInt8(0);

	var netfnbyte = decode_netfn(buf.readUInt8(1));

	var sum1 = buf.readUInt8(2);
	if (sum1 !== nonsense_checksum(buf, 0, 2)) {
		throw (new Error('checksum1 invalid'));
	}

	var res_addr = buf.readUInt8(3);

	t = buf.readUInt8(4);
	var seqno = t >> 2;
	var res_lun = t & 0x03;

	var cmd = cmd_lookup_code(netfnbyte.n, buf.readUInt8(5));

	/*
	 * XXX this is only here if this is a _RES NetFn.
	 */
	var cc = decode_cc(buf.readUInt8(6), cmd.cmd_cc_extra);

	var data = buf.slice(7, buf.length - 1);

	var sum2 = buf.readUInt8(buf.length - 1);

	if (sum2 !== nonsense_checksum(buf, 3, buf.length - 3 - 1)) {
		throw (new Error('checksum2 invalid'));
	}

	var extra = null;
	if (cc === 'success' && cmd.cmd_decoder) {
		extra = cmd.cmd_decoder(data);
	}

	return ({
		ipmb_type: netfnbyte.t,
		ipmb_netfn: netfnbyte.n,

		ipmb_req_addr: req_addr,
		ipmb_req_lun: netfnbyte.l,
		ipmb_res_addr: res_addr,
		ipmb_res_lun: res_lun,
		ipmb_seqno: seqno,
		ipmb_cmd: cmd.cmd_name,
		ipmb_cc: cc,
		ipmb_data: data,
		ipmb_extra: extra
	});
}

function
decode_cc(cc, extra_table)
{
	if (extra_table) {
		try {
			return (lib_common.lookup_vton(extra_table, cc));
		} catch (_) {
		}
	}

	return (lib_common.lookup_vton(COMPLETION_CODES, cc));
}

module.exports = {
	IPMI_ADDRESS_BMC: 0x20,
	IPMI_ADDRESS_CLIENT: 0x81,

	decode_packet: decode_packet,
	decode_inner: decode_inner,

	encode_packet: encode_packet,

	authcode_multi: authcode_multi,

	construct: construct,

	cmd_lookup_name: cmd_lookup_name,
	cmd_lookup_code: cmd_lookup_code,

	COMPLETION_CODES: COMPLETION_CODES,
	AUTHTYPES: AUTHTYPES,
	PRIVILEGE_LEVELS: PRIVILEGE_LEVELS,
};

load_commands();
