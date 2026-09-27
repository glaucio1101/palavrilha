/* Configuração do Firebase para o placar do Palavrilha 2.0 (e-mail + global +
 * amigos). Enquanto os campos estiverem vazios, o placar fica DESLIGADO e o
 * jogo funciona exatamente como antes (só localStorage, sem rede, sem login).
 *
 * Pode ser o MESMO projeto Firebase da versão clássica (classic/firebase-config.js)
 * ou um projeto separado — tanto faz, as coleções usadas (v2_*) não colidem
 * com as da versão clássica (users/scores). Ver LEADERBOARD.md.
 *
 * Preencha com os valores do Firebase Console -> Project settings ->
 * "Your apps" -> app da Web -> SDK setup. Esses valores NÃO são segredo: eles
 * vão para todos os navegadores. A proteção real está nas regras do Firestore
 * (firestore.rules).
 */
window.PALAVRILHA_FIREBASE = {
  apiKey: 'AIzaSyCTcibDEZ1YN-TOW3FlHn6hLQB_r41p_Ic',
  authDomain: 'palavrilha.firebaseapp.com',
  projectId: 'palavrilha',
  appId: '1:213985620405:web:0675d9ea7db2f572db69fc'
};
