// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks

import { SoundPlayer } from './SoundPlayer';

export class SoundPlayerConsumer {
  private _soundPlayer: SoundPlayer;
  public constructor() {
    this._soundPlayer = new SoundPlayer();
  }

  public playSomethingCool(): void {
    const coolSoundFileName: string = 'song.mp3';
    this._soundPlayer.playSoundFile(coolSoundFileName);
  }
}
