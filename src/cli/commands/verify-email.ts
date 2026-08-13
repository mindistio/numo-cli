import { Command } from 'commander';
import pc from 'picocolors';
import { requireAuth } from '../lib/uid';
import { isQuietMode } from '../lib/quiet';
import { printJson } from '../lib/output';
import { confirmVerificationCode, getMe, resendVerificationEmail } from '../services/me';

export function registerVerifyEmailCommand(program: Command) {
  program
    .command('verify-email')
    .description('Resend the verification email, or redeem a code from it')
    .option('--code <oobCode>', 'Redeem the oobCode from the verification link')
    .addHelpText('after', `
Examples:
  $ numo verify-email                     # resend the email
  $ numo verify-email --code A1b2C3…      # finish verification without a browser

The code is the oobCode query parameter of the link in the verification email.
Reading it needs access to the inbox, not a browser.`)
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const asJson = isQuietMode(opts);
      requireAuth();

      if (opts.code) {
        await confirmVerificationCode(opts.code);
        if (asJson) {
          printJson({ emailVerified: true });
        } else {
          console.log(pc.green('Email verified.'));
        }
        return;
      }

      // Asking the server first means an already-verified user is told so instead
      // of being sent an email they have no reason to open.
      const me = await getMe();
      if (me.emailVerified) {
        if (asJson) printJson(me);
        else console.log(pc.green('Email already verified.'));
        return;
      }

      await resendVerificationEmail();
      if (asJson) {
        printJson({ ...me, verificationEmailSent: true });
      } else {
        console.log(`Verification email sent to ${pc.bold(me.email ?? 'your address')}.`);
        console.log(pc.dim('  Check the spam folder too. Then click the link, or run:'));
        console.log(`  ${pc.cyan('$')} numo verify-email --code <oobCode from the link>`);
      }
    });
}
