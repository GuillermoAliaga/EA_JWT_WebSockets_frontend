import { provideHttpClient, withInterceptors } from '@angular/common/http';
// EXPLICAR EN EL VÍDEO
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
// EXPLICAR EN EL VÍDEO
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
// EXPLICAR EN EL VÍDEO
import { AuthService } from './services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: los parámetros de la ruta (como :id) y los de la URL (?returnUrl=)
    // llegan a los componentes como inputs
    provideRouter(routes, withComponentInputBinding()),
    // withInterceptors: todas las peticiones de HttpClient pasan por authInterceptor,
    // que les añade el token (ver interceptors/auth.interceptor.ts)
    provideHttpClient(withInterceptors([authInterceptor])),
    // EXPLICAR EN EL VÍDEO
    provideAppInitializer(() => {
      const auth = inject(AuthService);

      return firstValueFrom(auth.refresh())
        .then(() => undefined)
        // Sin cookie, caducada o inválida: el servidor responde 401. No es un error de la app,
        // solo significa que no hay sesión. Si dejara la promesa rechazada, la app no arrancaría.
        .catch(() => auth.clearLocalSession());
    }),
  ],
};