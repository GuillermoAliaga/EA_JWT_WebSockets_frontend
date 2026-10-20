import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

// Mensaje con el que la API responde 401 cuando el access token ha caducado (ver el contrato en LOGS.md)
const TOKEN_EXPIRED = 'El token ha caducado';

// Las peticiones son inmutables: para añadir una cabecera se hace una copia con clone()
function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

// Un interceptor se ejecuta en TODAS las peticiones de HttpClient, entre el servicio y la red.
// Este hace dos cosas, para que ningún servicio tenga que preocuparse del token:
//   1. Añade la cabecera Authorization: Bearer <token>.
// EXPLICAR EN EL VÍDEO
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  // EXPLICAR EN EL VÍDEO
  if (request.url.startsWith(`${environment.apiUrl}/auth/`)) {
    return next(request);
  }

  const auth = inject(AuthService);
  const token = auth.getToken();

  return next(token ? withToken(request, token) : request).pipe(
    catchError((error: HttpErrorResponse) => {
      // Cualquier error que no sea 401 lo dejo pasar tal cual al componente
      if (error.status !== 401) {
        return throwError(() => error);
      }

      // 401 porque el token ha caducado: lo renuevo y repito la petición original una vez
      if (error.error?.message === TOKEN_EXPIRED) {
        return auth.refresh().pipe(
          // Si el refresh falla (el refresh token también ha caducado), cierro la sesión
          catchError((refreshError) => {
            auth.logout();
            return throwError(() => refreshError);
          }),
          // switchMap: cuando llega el token nuevo, lanzo otra vez la petición con él
          switchMap((newToken) => next(withToken(request, newToken))),
        );
      }

      // Cualquier otro 401 (sin token, token falso...) quiere decir que no hay sesión válida
      auth.logout();
      return throwError(() => error);
    }),
  );
};
