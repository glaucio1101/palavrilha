/* Configuração do Firebase para o placar (global e de amigos).
 *
 * Enquanto os campos estiverem vazios, o placar fica DESLIGADO e o jogo
 * funciona exatamente como antes (só localStorage, sem rede, sem login).
 *
 * Para ligar, siga LEADERBOARD.md e cole aqui os valores do seu projeto
 * (Firebase Console -> Project settings -> "Your apps" -> app da Web -> SDK setup).
 * Esses valores NÃO são segredo: eles vão para todos os navegadores. A proteção
 * real está nas regras do Firestore (firestore.rules).
 */
window.PALAVRILHA_FIREBASE = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
  // Opcional: só depois de ativar o provedor Google em Authentication -> Sign-in method.
  // Deixe false por enquanto; o login anônimo já basta para o placar.
  google: false
};
