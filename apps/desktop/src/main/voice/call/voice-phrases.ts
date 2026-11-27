import type { VoiceLanguage } from '@shared/voice'

/**
 * Что звонок говорит сам, без модели: агенту нужно разрешение, ответ на вопрос или одобрение
 * плана; «ты ещё тут?» после долгой тишины; сбой. Коротко, на языке разговора.
 */
type Phrases = {
  permission: (what: string) => string
  question: (question: string) => string
  plan: string
  stillThere: string
  trouble: string
  /** Начало показа Walkthrough (ADR 0134): что человек хочет увидеть. */
  walkthroughHello: string
}

const PHRASES: Record<VoiceLanguage, Phrases> = {
  en: {
    permission: (what) => `I need your permission: ${what}. Confirm it on the screen.`,
    question: (question) => `${question} Answer on the screen or tell me.`,
    plan: 'The plan is ready. Approve it on the screen.',
    stillThere: 'Are you still there?',
    trouble: 'Something went wrong, the details are in the chat.',
    walkthroughHello: 'What should I show or explain?',
  },
  ru: {
    permission: (what) => `Нужно разрешение: ${what}. Подтверди на экране.`,
    question: (question) => `${question} Ответь на экране или голосом.`,
    plan: 'План готов. Одобри его на экране.',
    stillThere: 'Ты ещё тут?',
    trouble: 'Что-то пошло не так, подробности в чате.',
    walkthroughHello: 'Что показать или объяснить?',
  },
  es: {
    permission: (what) => `Necesito tu permiso: ${what}. Confírmalo en la pantalla.`,
    question: (question) => `${question} Responde en la pantalla o dímelo.`,
    plan: 'El plan está listo. Apruébalo en la pantalla.',
    stillThere: '¿Sigues ahí?',
    trouble: 'Algo salió mal, los detalles están en el chat.',
    walkthroughHello: '¿Qué te muestro o te explico?',
  },
  pt: {
    permission: (what) => `Preciso da sua permissão: ${what}. Confirme na tela.`,
    question: (question) => `${question} Responda na tela ou me diga.`,
    plan: 'O plano está pronto. Aprove na tela.',
    stillThere: 'Você ainda está aí?',
    trouble: 'Algo deu errado, os detalhes estão no chat.',
    walkthroughHello: 'O que eu mostro ou explico?',
  },
  fr: {
    permission: (what) => `J'ai besoin de ton autorisation : ${what}. Confirme à l'écran.`,
    question: (question) => `${question} Réponds à l'écran ou dis-le-moi.`,
    plan: "Le plan est prêt. Approuve-le à l'écran.",
    stillThere: 'Tu es toujours là ?',
    trouble: 'Quelque chose a mal tourné, les détails sont dans le chat.',
    walkthroughHello: "Qu'est-ce que je te montre ou t'explique ?",
  },
  de: {
    permission: (what) => `Ich brauche deine Erlaubnis: ${what}. Bestätige es auf dem Bildschirm.`,
    question: (question) => `${question} Antworte auf dem Bildschirm oder sag es mir.`,
    plan: 'Der Plan ist fertig. Bestätige ihn auf dem Bildschirm.',
    stillThere: 'Bist du noch da?',
    trouble: 'Etwas ist schiefgelaufen, die Details stehen im Chat.',
    walkthroughHello: 'Was soll ich zeigen oder erklären?',
  },
  it: {
    permission: (what) => `Mi serve il tuo permesso: ${what}. Confermalo sullo schermo.`,
    question: (question) => `${question} Rispondi sullo schermo o dimmelo.`,
    plan: 'Il piano è pronto. Approvalo sullo schermo.',
    stillThere: 'Ci sei ancora?',
    trouble: 'Qualcosa è andato storto, i dettagli sono nella chat.',
    walkthroughHello: 'Cosa ti mostro o ti spiego?',
  },
  nl: {
    permission: (what) => `Ik heb je toestemming nodig: ${what}. Bevestig het op het scherm.`,
    question: (question) => `${question} Antwoord op het scherm of zeg het me.`,
    plan: 'Het plan is klaar. Keur het goed op het scherm.',
    stillThere: 'Ben je er nog?',
    trouble: 'Er ging iets mis, de details staan in de chat.',
    walkthroughHello: 'Wat zal ik laten zien of uitleggen?',
  },
  hi: {
    permission: (what) => `मुझे आपकी अनुमति चाहिए: ${what}. स्क्रीन पर पुष्टि करें।`,
    question: (question) => `${question} स्क्रीन पर या बोलकर जवाब दें।`,
    plan: 'योजना तैयार है। स्क्रीन पर उसे मंज़ूर करें।',
    stillThere: 'क्या आप अभी भी हैं?',
    trouble: 'कुछ गड़बड़ हो गई, विवरण चैट में है।',
    walkthroughHello: 'मैं क्या दिखाऊँ या समझाऊँ?',
  },
  ja: {
    permission: (what) => `許可が必要です: ${what}。画面で確認してください。`,
    question: (question) => `${question} 画面か声で答えてください。`,
    plan: '計画ができました。画面で承認してください。',
    stillThere: 'まだいますか？',
    trouble: '問題が起きました。詳しくはチャットを見てください。',
    walkthroughHello: '何をお見せしましょうか、それとも説明しましょうか？',
  },
}

export const phrasesOf = (language: VoiceLanguage): Phrases => PHRASES[language]

/** Образец голоса для «Прослушать» в настройках. */
const SAMPLES: Record<VoiceLanguage, string> = {
  en: "Hi! This is how I'll sound when we talk.",
  ru: 'Привет! Так я буду звучать, когда мы разговариваем.',
  es: 'Hola. Así sonaré cuando hablemos.',
  pt: 'Oi! É assim que eu vou soar quando a gente conversar.',
  fr: 'Salut ! Voilà comment je sonnerai quand on parlera.',
  de: 'Hallo! So klinge ich, wenn wir miteinander sprechen.',
  it: 'Ciao! Ecco come suonerò quando parliamo.',
  nl: 'Hoi! Zo klink ik als we met elkaar praten.',
  hi: 'नमस्ते! जब हम बात करेंगे, मैं ऐसी सुनाई दूँगी।',
  ja: 'こんにちは。話すときは、こんな声になります。',
}

export const sampleOf = (language: VoiceLanguage): string => SAMPLES[language]
