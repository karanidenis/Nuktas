/**
 * TwiML string builders for the Nuktas voice intake flow.
 * Returns raw XML strings that Express sends back to Twilio.
 */

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twilioLangCode(lang) {
  return { sw: 'sw-KE', en: 'en-US' }[lang] ?? 'en-US';
}

// Twilio's `experimental_conversations` model does not support Swahili, so only
// request it for English; the default model (Google STT V2) supports sw-KE.
function speechModelAttr(lang) {
  return lang === 'en' ? ' speechModel="experimental_conversations"' : '';
}

function ttsVoice(lang) {
  return 'Polly.Joanna';
}

// ── TwiML builders ────────────────────────────────────────────────────────────

function consentRequest(language = 'en') {
  const greetings = {
    sw: 'Karibu kwenye mfumo wa kliniki. Simu hii itarekodiwa kwa ajili ya ubora wa huduma na uandikishaji wa matibabu. Unakubali? Sema Ndiyo au Hapana.',
    en: 'Welcome to the clinic intake system. This call will be recorded for quality and medical intake purposes. Do you agree? Say Yes or No.',
  };
  const greeting = greetings[language] ?? greetings.en;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/webhooks/voice/consent" method="POST" speechTimeout="5" language="${twilioLangCode(language)}">
    <Say voice="${ttsVoice(language)}">${escapeXml(greeting)}</Say>
  </Gather>
  <Redirect>/webhooks/voice/consent_timeout</Redirect>
</Response>`;
}

function languageSelection() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf speech" action="/webhooks/voice/language" method="POST" timeout="10" numDigits="1">
    <Say voice="Polly.Joanna">Please select your language. Press 1 for Kiswahili. Press 2 for English.</Say>
  </Gather>
  <Redirect>/webhooks/voice/language_timeout</Redirect>
</Response>`;
}

function languageTimeout() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We did not receive a language selection. Defaulting to English.</Say>
  <Redirect method="POST">/webhooks/voice/intake/start</Redirect>
</Response>`;
}

function sayAndGather(text, actionPath, language = 'en', speechTimeout = 'auto') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionPath}" method="POST" speechTimeout="${speechTimeout}" language="${twilioLangCode(language)}" speechModel="experimental_conversations">
    <Say voice="${ttsVoice(language)}">${escapeXml(text)}</Say>
  </Gather>
  <Redirect method="POST">${actionPath}?timeout=true</Redirect>
</Response>`;
}

function playAndGather(audioUrl, actionPath, language = 'en') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionPath}" method="POST" speechTimeout="auto" language="${twilioLangCode(language)}"${speechModelAttr(language)}>
    <Play>${escapeXml(audioUrl)}</Play>
  </Gather>
  <Redirect method="POST">${actionPath}?timeout=true</Redirect>
</Response>`;
}

function sayAndHangup(text, language = 'en') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${ttsVoice(language)}">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

// `audioUrl` is built by getTtsUrl in the webhook layer, which already escapes the
// query separator as &amp; — do not escape it again or the TwiML breaks.
function playAndHangup(audioUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Hangup/>
</Response>`;
}

function transferToOperator() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We are transferring you to a clinic operator. Please hold.</Say>
  <Dial>
    <Number>${process.env.OPERATOR_PHONE || process.env.TWILIO_PHONE_NUMBER || ''}</Number>
  </Dial>
  <Hangup/>
</Response>`;
}

module.exports = {
  consentRequest,
  languageSelection,
  languageTimeout,
  sayAndGather,
  playAndGather,
  sayAndHangup,
  playAndHangup,
  transferToOperator,
};
