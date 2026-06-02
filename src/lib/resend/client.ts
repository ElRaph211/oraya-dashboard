import { Resend } from "resend";

let _resend: Resend | undefined;

/**
 * Singleton lazy — n'instancie Resend que lorsqu'un appel arrive.
 * Permet au serveur de démarrer même si RESEND_API_KEY n'est pas encore défini.
 */
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY non configurée — impossible d'envoyer des emails");
    }
    _resend = new Resend(key);
  }
  return _resend;
}

// Proxy lazy : on n'instancie Resend qu'à la première propriété accédée
export const resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    return Reflect.get(getResend(), prop, receiver);
  },
});
