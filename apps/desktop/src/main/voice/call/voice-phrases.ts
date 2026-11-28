import type { VoiceLanguage } from '@shared/voice'

/**
 * Что звонок говорит сам, без модели: агенту нужно разрешение, ответ на вопрос или одобрение
 * плана; «ты ещё тут?» после долгой тишины; сбой; в показе - отклик на реплику и что делать с
 * молчанием на вопрос. Коротко, на языке разговора, без рода говорящего: голос бывает и женским.
 */
type Phrases = {
  permission: (what: string) => string
  question: (question: string) => string
  plan: string
  stillThere: string
  trouble: string
  /** Начало показа Walkthrough (ADR 0134): что человек хочет увидеть. */
  walkthroughHello: string
  /**
   * Показ (ADR 0135): человек договорил - звонок сразу отзывается, пока модель думает, а не молчит
   * секунды. Несколько, по кругу: одна и та же фраза на каждую реплику звучит роботом.
   */
  heard: readonly string[]
  /** Молчание на вопрос - согласие: звонок говорит, что идёт дальше. */
  goOn: string
  /** Молчание на важный вопрос (отправить, купить, удалить): звонок повторяет его. */
  askAgain: (question: string) => string
  /** И снова молчание: показ кончается, IDE возвращает к чату. */
  giveUp: string
}

const PHRASES: Record<VoiceLanguage, Phrases> = {
  en: {
    permission: (what) => `I need your permission: ${what}. Confirm it on the screen.`,
    question: (question) => `${question} Answer on the screen or tell me.`,
    plan: 'The plan is ready. Approve it on the screen.',
    stillThere: 'Are you still there?',
    trouble: 'Something went wrong, the details are in the chat.',
    walkthroughHello: 'What should I show or explain?',
    heard: ['Got it, one second.', 'Okay, on it.', 'Right, let me look.', 'One moment.'],
    goOn: "No answer, so I'll take that as a yes and go on.",
    askAgain: (question) => `Let me ask again. ${question}`,
    giveUp: "No answer, so I'm ending the walkthrough. Let's go on in the chat.",
  },
  ru: {
    permission: (what) => `Нужно разрешение: ${what}. Подтверди на экране.`,
    question: (question) => `${question} Ответь на экране или голосом.`,
    plan: 'План готов. Одобри его на экране.',
    stillThere: 'Ты ещё тут?',
    trouble: 'Что-то пошло не так, подробности в чате.',
    walkthroughHello: 'Что показать или объяснить?',
    heard: ['Хорошо, секунду.', 'Так, смотрю.', 'Ясно, сейчас.', 'Минуту.'],
    goOn: 'Не слышу ответа. Считаю, что да, и продолжаю.',
    askAgain: (question) => `Повторю вопрос. ${question}`,
    giveUp: 'Ответа нет. Заканчиваю показ, продолжим в чате.',
  },
  es: {
    permission: (what) => `Necesito tu permiso: ${what}. Confírmalo en la pantalla.`,
    question: (question) => `${question} Responde en la pantalla o dímelo.`,
    plan: 'El plan está listo. Apruébalo en la pantalla.',
    stillThere: '¿Sigues ahí?',
    trouble: 'Algo salió mal, los detalles están en el chat.',
    walkthroughHello: '¿Qué te muestro o te explico?',
    heard: ['Entendido, un segundo.', 'Vale, ahora mismo.', 'A ver, lo miro.', 'Un momento.'],
    goOn: 'No oigo respuesta. Lo tomo como un sí y sigo.',
    askAgain: (question) => `Te lo pregunto otra vez. ${question}`,
    giveUp: 'No hay respuesta. Termino la demostración, seguimos en el chat.',
  },
  pt: {
    permission: (what) => `Preciso da sua permissão: ${what}. Confirme na tela.`,
    question: (question) => `${question} Responda na tela ou me diga.`,
    plan: 'O plano está pronto. Aprove na tela.',
    stillThere: 'Você ainda está aí?',
    trouble: 'Algo deu errado, os detalhes estão no chat.',
    walkthroughHello: 'O que eu mostro ou explico?',
    heard: ['Entendi, um segundo.', 'Certo, já vou.', 'Deixa eu ver.', 'Um momento.'],
    goOn: 'Não ouvi resposta. Vou entender como sim e continuar.',
    askAgain: (question) => `Vou perguntar de novo. ${question}`,
    giveUp: 'Sem resposta. Vou encerrar a demonstração, continuamos no chat.',
  },
  fr: {
    permission: (what) => `J'ai besoin de ton autorisation : ${what}. Confirme à l'écran.`,
    question: (question) => `${question} Réponds à l'écran ou dis-le-moi.`,
    plan: "Le plan est prêt. Approuve-le à l'écran.",
    stillThere: 'Tu es toujours là ?',
    trouble: 'Quelque chose a mal tourné, les détails sont dans le chat.',
    walkthroughHello: "Qu'est-ce que je te montre ou t'explique ?",
    heard: ['Compris, une seconde.', "D'accord, j'y vais.", 'Voyons voir.', 'Un instant.'],
    goOn: 'Pas de réponse, je prends ça pour un oui et je continue.',
    askAgain: (question) => `Je repose la question. ${question}`,
    giveUp: 'Pas de réponse. Je termine la démonstration, on continue dans le chat.',
  },
  de: {
    permission: (what) => `Ich brauche deine Erlaubnis: ${what}. Bestätige es auf dem Bildschirm.`,
    question: (question) => `${question} Antworte auf dem Bildschirm oder sag es mir.`,
    plan: 'Der Plan ist fertig. Bestätige ihn auf dem Bildschirm.',
    stillThere: 'Bist du noch da?',
    trouble: 'Etwas ist schiefgelaufen, die Details stehen im Chat.',
    walkthroughHello: 'Was soll ich zeigen oder erklären?',
    heard: ['Verstanden, einen Moment.', 'Okay, mache ich.', 'Mal sehen.', 'Einen Augenblick.'],
    goOn: 'Keine Antwort, ich nehme das als Ja und mache weiter.',
    askAgain: (question) => `Ich frage noch einmal. ${question}`,
    giveUp: 'Keine Antwort. Ich beende die Vorführung, wir machen im Chat weiter.',
  },
  it: {
    permission: (what) => `Mi serve il tuo permesso: ${what}. Confermalo sullo schermo.`,
    question: (question) => `${question} Rispondi sullo schermo o dimmelo.`,
    plan: 'Il piano è pronto. Approvalo sullo schermo.',
    stillThere: 'Ci sei ancora?',
    trouble: 'Qualcosa è andato storto, i dettagli sono nella chat.',
    walkthroughHello: 'Cosa ti mostro o ti spiego?',
    heard: ['Capito, un secondo.', 'Va bene, subito.', 'Vediamo.', 'Un attimo.'],
    goOn: 'Nessuna risposta, lo prendo come un sì e vado avanti.',
    askAgain: (question) => `Te lo chiedo di nuovo. ${question}`,
    giveUp: 'Nessuna risposta. Chiudo la dimostrazione, continuiamo nella chat.',
  },
  nl: {
    permission: (what) => `Ik heb je toestemming nodig: ${what}. Bevestig het op het scherm.`,
    question: (question) => `${question} Antwoord op het scherm of zeg het me.`,
    plan: 'Het plan is klaar. Keur het goed op het scherm.',
    stillThere: 'Ben je er nog?',
    trouble: 'Er ging iets mis, de details staan in de chat.',
    walkthroughHello: 'Wat zal ik laten zien of uitleggen?',
    heard: [
      'Begrepen, een moment.',
      'Oké, ik ga ermee aan de slag.',
      'Even kijken.',
      'Een ogenblik.',
    ],
    goOn: 'Geen antwoord, ik neem aan van wel en ga verder.',
    askAgain: (question) => `Ik vraag het nog een keer. ${question}`,
    giveUp: 'Geen antwoord. Ik stop de rondleiding, we gaan verder in de chat.',
  },
  hi: {
    permission: (what) => `मुझे आपकी अनुमति चाहिए: ${what}. स्क्रीन पर पुष्टि करें।`,
    question: (question) => `${question} स्क्रीन पर या बोलकर जवाब दें।`,
    plan: 'योजना तैयार है। स्क्रीन पर उसे मंज़ूर करें।',
    stillThere: 'क्या आप अभी भी हैं?',
    trouble: 'कुछ गड़बड़ हो गई, विवरण चैट में है।',
    walkthroughHello: 'मैं क्या दिखाऊँ या समझाऊँ?',
    heard: ['समझ गई, एक सेकंड।', 'ठीक है, अभी करती हूँ।', 'एक मिनट, देखती हूँ।', 'एक पल।'],
    goOn: 'जवाब नहीं मिला, मैं इसे हाँ मानकर आगे बढ़ती हूँ।',
    askAgain: (question) => `मैं फिर से पूछती हूँ। ${question}`,
    giveUp: 'जवाब नहीं मिला। मैं प्रदर्शन बंद कर रही हूँ, चैट में आगे बात करते हैं।',
  },
  ja: {
    permission: (what) => `許可が必要です: ${what}。画面で確認してください。`,
    question: (question) => `${question} 画面か声で答えてください。`,
    plan: '計画ができました。画面で承認してください。',
    stillThere: 'まだいますか？',
    trouble: '問題が起きました。詳しくはチャットを見てください。',
    walkthroughHello: '何をお見せしましょうか、それとも説明しましょうか？',
    heard: [
      'わかりました、少々お待ちください。',
      'はい、すぐやります。',
      'ちょっと見てみますね。',
      'お待ちください。',
    ],
    goOn: '返事がないので、はいと受け取って進めます。',
    askAgain: (question) => `もう一度聞きます。${question}`,
    giveUp: '返事がないので、案内を終わります。続きはチャットで。',
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
