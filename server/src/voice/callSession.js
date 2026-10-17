/**
 * In-memory call session store.
 * Mirrors the Elixir GenServer-based CallSession.
 * Each active Twilio call gets one session; sessions auto-expire after 15 minutes.
 */

const SESSION_TTL_MS = 15 * 60 * 1000;

class CallSession {
  constructor(callSid) {
    this.callSid = callSid;
    this.callId = null;
    this.patient = null;
    this.clinicId = null;
    this.language = 'en';
    this.state = 'greeting'; // greeting | consented | language_select | intake | completed | failed
    this.messages = [];      // OpenAI conversation history
    this.turnCount = 0;
    this.intakeResult = null;
    this.callerCity = null;   // from Twilio's FromCity field
    this.callerLocation = null; // confirmed/refined by AI during intake
    this.startedAt = Date.now();

    this._timer = setTimeout(() => store.delete(callSid), SESSION_TTL_MS);
  }

  destroy() {
    clearTimeout(this._timer);
    store.delete(this.callSid);
  }
}

/** @type {Map<string, CallSession>} */
const store = new Map();

function create(callSid) {
  const session = new CallSession(callSid);
  store.set(callSid, session);
  return session;
}

function get(callSid) {
  return store.get(callSid) ?? null;
}

function destroy(callSid) {
  store.get(callSid)?.destroy();
}

function getOrCreate(callSid) {
  return store.get(callSid) ?? create(callSid);
}

module.exports = { create, get, destroy, getOrCreate };
