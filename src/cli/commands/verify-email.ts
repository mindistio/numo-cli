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
        // Report what the server said, not what we hoped. `emailVerified: true` was a
        // literal printed on any 2xx — the same claim the server itself used to assert
        // without looking. An older server omits the field; then say the code was
        // accepted and stop, rather than inventing a state to fill the gap.
        const { emailVerified } = await confirmVerificationCode(opts.code);
        if (asJson) {
          printJson({ emailVerified });
        } else if (emailVerified === true) {
          console.log(pc.green('Email verified.'));
        } else if (emailVerified === false) {
          console.log('Code accepted, but the account still reports unverified.');
          console.log(pc.dim(`  Check again with: ${pc.cyan('$')} numo verify-email`));
        } else {
          console.log(pc.green('Code accepted.'));
        }
        return;
      }

      // Asking the server first means an already-verified user is told so instead
      // of being sent an email they have no reason to open. An older server does
      // not report the flag at all; then the resend goes ahead — it is what was
      // asked for — but the output does not pretend to know the state either way.
      const me = await getMe();
      if (me.emailVerified === true) {
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
