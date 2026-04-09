import { Command } from 'commander';
import { runGet } from '../lib/actions';
import { printRecord } from '../lib/output';
import { getProfile } from '../services/profile';
import type { ProfileResponse } from '../types/api';

export function registerProfileCommands(program: Command) {
  program
    .command('profile')
    .description('View your profile')
    .action(async function (this: Command) {
      await runGet({
        global: this.optsWithGlobals(),
        fn: () => getProfile(),
        spinnerMessage: 'Fetching profile...',
        onInteractive: (data: ProfileResponse) => {
          console.log('');
          printRecord([
            ['Email', data.email],
            ['Username', data.username],
            ['Photo', data.photoURL],
          ]);
          console.log('');
        },
      });
    });
}
