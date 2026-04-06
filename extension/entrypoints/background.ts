import { defineBackground } from 'wxt/utils/define-background';

import '../src/background';

export default defineBackground(() => {
  // The current background logic lives in ../src/background and initializes
  // itself via extension runtime lifecycle listeners.
});
