/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_dgram = require('dgram');
var mod_events = require('events');
var mod_util = require('util');
var mod_stream = require('stream');

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var mod_vasync = require('vasync');

var lib_rmcp = require('./rmcp');
var lib_asf = require('./asf');
var lib_ipmi = require('./ipmi');
var lib_inflight = require('./inflight');

var mergeObjects = mod_jsprim.mergeObjects;

var IPMB_DEFAULTS = {
	ipmb_res_addr: lib_ipmi.IPMI_ADDRESS_BMC,
	ipmb_res_lun: 0,
	ipmb_req_addr: lib_ipmi.IPMI_ADDRESS_CLIENT,
	ipmb_req_lun: 0,
	ipmb_type: 'req',
};

function
rand_id()
{
	return ((Math.random() * 0xffffffff) >>> 0);
}

function
IPMI(opts)
{
	var self = this;
	mod_events.EventEmitter.call(self);

	self.ipmi_opts = opts;

	self.ipmi_debug = false;

	self.ipmi_sock = mod_dgram.createSocket('udp4');
	self.ipmi_sock.on('listening', function () {
		self.emit('listening', self.ipmi_sock.address());
	});
	self.ipmi_sock.bind();

	self.ipmi_inflights = new lib_inflight.InflightRegister();

	self.ipmi_active = false;
	self.ipmi_session = 0;
	self.ipmi_sequence = 0;
	self.ipmi_auth_msgs = false;

	self.ipmi_auth_type = 'md5';

	self.ipmi_sock.on('message', function (msg, rinfo) {
		if (rinfo.address !== self.ipmi_opts.host) {
			/*
			 * Ignore packets not from our target host.
			 */
			return;
		}

		if (self.ipmi_debug)
			lib_ipmi.dump_buf('recv_packet', msg);

		self.handle_message(msg);
	});

	self.ipmi_pingseq = 100;
}
mod_util.inherits(IPMI, mod_events.EventEmitter);

IPMI.prototype.handle_message = function
handle_message(buf)
{
	var self = this;

	var rmcp;
	var asf;
	var ipmi;
	var ipmb;

	try {
		rmcp = lib_rmcp.decode_packet(buf);
	} catch (ex) {
		console.error('DROP RMCP: %s', ex.message);
		return;
	}

	switch (rmcp.rmcp_class) {
	case 'asf':
		try {
			asf = lib_asf.decode_packet(rmcp.rmcp_data);
		} catch (ex) {
			console.error('DROP ASF: %s', ex.message);
			return;
		}
		var infl = self.ipmi_inflights.lookup(asf.asf_msgtag);
		if (infl) {
			infl.emit('asf_' + asf.asf_msgtype, asf);
		}
		break;

	case 'ipmi':
		try {
			ipmi = lib_ipmi.decode_packet(rmcp.rmcp_data);
		} catch (ex) {
			console.error('DROP IPMI: %s', ex.stack);
			return;
		}

		try {
			ipmb = lib_ipmi.decode_inner(ipmi.ipmi_data);
		} catch (ex) {
			console.error('DROP IPMB: %s', ex.stack);
			return;
		}

		if (ipmb.ipmb_req_addr !== lib_ipmi.IPMI_ADDRESS_CLIENT) {
			console.error('DROP IPMB (WRONG DST ADDR)');
			return;
		}

		var infl = self.ipmi_inflights.lookup(ipmb.ipmb_seqno);
		if (infl) {
			infl.emit('ipmi', ipmb);
		}
		break;
	}
};

IPMI.prototype._send = function
_send(buf)
{
	var self = this;

	if (self.ipmi_debug)
		lib_ipmi.dump_buf('send_packet', buf);

	self.ipmi_sock.send(buf, 0, buf.length, lib_rmcp.RMCP_PRIMARY_PORT,
	    self.ipmi_opts.host);
};

IPMI.prototype._send_ipmi = function
_send_ipmi(ses_id, seqno, cmd, extra, callback)
{
	var self = this;
	var infl = self.ipmi_inflights.register({
		ses_id: ses_id,
		seqno: seqno,
		cmd: cmd,
		extra: extra,
	});

	var data = lib_ipmi.construct(mergeObjects({
		ipmb_cmd: cmd,
		ipmb_seqno: infl.id(),
		ipmb_extra: extra
	}, {}, IPMB_DEFAULTS));

	var authtype = 'none';
	var authcode;

	if (self.ipmi_auth_msgs) {
		authtype = self.ipmi_auth_type;
		authcode = lib_ipmi.authcode_multi(self.ipmi_auth_type,
		    self.ipmi_opts.pass, ses_id, data, seqno);
	}

	var buf = lib_rmcp.encode_packet({
		rmcp_type: 'data',
		rmcp_class: 'ipmi',
		rmcp_data: lib_ipmi.encode_packet({
			ipmi_version: '1.5',
			ipmi_authtype: authtype,
			ipmi_auth_code: authcode,
			ipmi_sequence: seqno,
			ipmi_session_id: ses_id,
			ipmi_data: data
		})
	});

	infl.on('timeout', function () {
		infl.complete();
		callback(new Error('command "' + cmd + '" to host "' +
		    self.ipmi_opts.host + '" timed out'));
	});
	infl.on('ipmi', function (ipmb) {
		infl.complete();

		if (ipmb.ipmb_cc !== 'success') {
			callback(new Error('operation error: %s',
			    ipmb.ipmb_cc));
			return;
		}

		callback(null, ipmb.ipmb_extra);
	});

	self._send(buf);
	infl.start_timeout(5000);
};

IPMI.prototype._get_chassis_status = function
_get_chassis_status(cb)
{
	var self = this;

	self._send_ipmi(self.ipmi_session, self.ipmi_sequence++,
	    'get_chassis_status', {}, cb);
};

IPMI.prototype._get_device_id = function
_get_device_id(cb)
{
	var self = this;

	self._send_ipmi(self.ipmi_session, self.ipmi_sequence++,
	    'get_device_id', {}, cb);
};

IPMI.prototype._get_system_guid = function
_get_system_guid(cb)
{
	var self = this;

	var ses = 0;
	var seq = 0;
	if (self.ipmi_session !== 0) {
		ses = self.ipmi_session;
		seq = self.ipmi_sequence++;
	}

	self._send_ipmi(ses, seq, 'get_system_guid', {}, cb);
};

IPMI.prototype._get_chassis_cap = function
_get_chassis_cap(cb)
{
	var self = this;

	self._send_ipmi(self.ipmi_session, self.ipmi_sequence++,
	    'get_chassis_cap', {}, cb);
};

IPMI.prototype._get_session_info = function
_get_session_info(cb)
{
	var self = this;

	self._send_ipmi(self.ipmi_session, self.ipmi_sequence++,
	    'get_session_info', {}, cb);
};

IPMI.prototype._set_session_priv_level = function
_set_session_priv_level(level, cb)
{
	var self = this;

	self._send_ipmi(self.ipmi_session, self.ipmi_sequence++,
	    'set_session_priv_level', {
		sspl_level: level
	}, cb);
};

IPMI.prototype._activate_session = function
_activate_session(chal, temp_ses_id, seq_no, level, cb)
{
	var self = this;

	self._send_ipmi(temp_ses_id, 0, 'activate_session', {
		acts_authtype: self.ipmi_auth_type,
		acts_seqno: seq_no,
		acts_challenge: chal,
		acts_privilege: level
	}, cb);
};

IPMI.prototype._get_session_challenge = function
_get_session_challenge(cb)
{
	var self = this;

	var ses = 0;
	var seq = 0;
	if (self.ipmi_session !== 0) {
		ses = self.ipmi_session;
		seq = self.ipmi_sequence++;
	}

	self._send_ipmi(ses, seq, 'get_session_challenge', {
		chal_authtype: self.ipmi_auth_type,
		chal_username: self.ipmi_opts.user
	}, cb);
};

IPMI.prototype._get_chan_auth_cap = function
_get_chan_auth_cap(cb)
{
	var self = this;

	var ses = 0;
	var seq = 0;
	if (self.ipmi_session !== 0) {
		ses = self.ipmi_session;
		seq = self.ipmi_sequence++;
	}

	self._send_ipmi(ses, seq, 'get_chan_auth_cap', {}, cb);
};


IPMI.prototype.start_session = function
start_session(cb)
{
	var self = this;

	mod_assert.ok(!self.ipmi_active, 'concurrent start_session');
	self.ipmi_active = true;
	self.ipmi_auth_msgs = false;

	mod_assert.strictEqual(self.ipmi_session, 0);
	mod_assert.strictEqual(self.ipmi_sequence, 0);

	mod_vasync.waterfall([
		function (next) {
			/*
			 * We try an RMCP-level ping to see if the remote host
			 * is reachable before any more sophisticated IPMI
			 * messages.
			 */
			self.ping(function (err) {
				next(err);
			});
		},
		function (next) {
			self._get_chan_auth_cap(function (err, cac) {
				next(err, cac);
			});
		},
		function (cac, next) {
			if (cac.cac_auth_modes.indexOf(
			    self.ipmi_auth_type) === -1) {
				next(new Error([
					'NO ',
					self.ipmi_auth_type,
					' AUTH SUPPORT (only: ',
					cac.cac_auth_modes.join(', '),
					')'
				].join('')));
				return;
			}

			self._get_session_challenge(function (err, chal) {
				next(err, chal);
			});
		},
		function (chal, next) {
			self.ipmi_auth_msgs = true;

			self._activate_session(chal.chal_challenge,
			    chal.chal_session, rand_id(), 'administrator',
			    function (err, acts) {
				next(err, acts);
			});
		},
		function (acts, next) {
			mod_assert.number(acts.acts_session);
			mod_assert.number(acts.acts_seq_no);

			/*
			 * The session number sent in the Active Session
			 * response may not be the same as the temporary
			 * session number we have seen previously.
			 */
			mod_assert.strictEqual(self.ipmi_session, 0);
			self.ipmi_session = acts.acts_session;

			/*
			 * We are to use the sequence number sent to us by the
			 * BMC:
			 */
			mod_assert.strictEqual(self.ipmi_sequence, 0);
			self.ipmi_sequence = acts.acts_seq_no;

			if (acts.acts_authtype === 'none') {
				self.ipmi_auth_msgs = false;
			}

			/*
			 * Raise session privilege level:
			 */
			self._set_session_priv_level('administrator',
			    function (err, res) {
				next(err, res);
			});
		},
	], function (err) {
		if (err) {
			cb(err);
			return;
		}

		cb(null, {
			session: self.ipmi_session
		});
	});
};

IPMI.prototype.close = function
close()
{
	var self = this;

	self.ipmi_sock.close();
};

IPMI.prototype.close_session = function
close_session(cb)
{
	var self = this;

	if (self.ipmi_session === 0) {
		setImmediate(cb);
		return;
	}

	self._send_ipmi(self.ipmi_session, self.ipmi_sequence++,
	    'close_session', {
		clss_session: self.ipmi_session,
	}, cb);
};

IPMI.prototype.ping = function
ping(callback)
{
	var self = this;

	var infl = self.ipmi_inflights.register({
		type: 'ping',
	});

	var asf = lib_asf.encode_packet({
		asf_msgtype: 'ping',
		asf_msgtag: infl.id()
	});

	var buf = lib_rmcp.encode_packet({
		rmcp_type: 'data',
		rmcp_class: 'asf',
		rmcp_data: asf
	});

	infl.on('timeout', function () {
		infl.complete();
		callback(new Error('ping timeout'));
	});
	infl.on('asf_pong', function () {
		infl.complete();
		callback();
	});

	self._send(buf);
	infl.start_timeout(2000);
};

module.exports = {
	IPMI: IPMI
};
