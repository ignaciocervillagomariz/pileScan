import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/**
 * Where photos come from. Inside a native shell (Capacitor) the Camera plugin is used. In a
 * browser the page falls back to <input type="file">: on phones `capture` opens the camera app
 * directly, on desktop it opens the file picker.
 *
 * No browser camera API (getUserMedia, Capacitor's web camera UI) is ever used, so capture works
 * on a plain-HTTP origin such as a LAN IP, where `window.isSecureContext` is false. HTTPS is still
 * recommended for the service worker (PWA install), see docs/phone-testing.md.
 */
@Injectable({ providedIn: 'root' })
export class PhotoSourceService {
  readonly nativeCamera = Capacitor.isNativePlatform();

  /** Takes a photo with the native camera. Returns null if the user cancels. */
  async takeNativePhoto(): Promise<File | null> {
    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 90,
        correctOrientation: true,
      });
      if (!photo.webPath) {
        return null;
      }
      const blob = await (await fetch(photo.webPath)).blob();
      return new File([blob], `photo.${photo.format}`, { type: blob.type });
    } catch {
      return null;
    }
  }
}
