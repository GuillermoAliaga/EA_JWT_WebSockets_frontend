import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
// EXPLICAR EN EL VÍDEO
import { Observable, finalize, map, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  User,
} from '../models';


const USER_KEY = 'user';

// Al arrancar la app, recupero el usuario que dejó guardado el último login
function readStoredUser(): User | null {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as User;
  } catch {
    // Si alguien ha tocado el valor a mano y no es JSON, es como no tener sesión
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private baseUrl = `${environment.apiUrl}/auth`;

  // EXPLICAR EN EL VÍDEO
  private accessToken = signal<string | null>(null);

  // El usuario con sesión, o null si no hay sesión. Es privado y modificable aquí dentro;
  // fuera solo se puede leer (asReadonly), así nadie cambia la sesión sin pasar por este servicio
  private currentUser = signal<User | null>(readStoredUser());
  readonly user = this.currentUser.asReadonly();

  // EXPLICAR EN EL VÍDEO
  readonly isLoggedIn = computed(() => this.accessToken() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  /** POST /auth/register. No inicia sesión: la API no devuelve token y hay que hacer login */
  register(data: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/register`, data);
  }

  /** POST /auth/login. Si va bien, guarda el access token en memoria y el usuario */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    // EXPLICAR EN EL VÍDEO
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, credentials, { withCredentials: true })
      .pipe(
        // tap: hago algo con la respuesta sin cambiarla; el componente la sigue recibiendo igual
        tap((response) => {
          // EXPLICAR EN EL VÍDEO
          this.accessToken.set(response.token);
          localStorage.setItem(USER_KEY, JSON.stringify(response.user));
          this.currentUser.set(response.user);
        }),
      );
  }

  /** POST /auth/refresh. El navegador envía la cookie solo; devuelve un access token nuevo */
  refresh(): Observable<string> {
    // EXPLICAR EN EL VÍDEO
    return this.http
      .post<RefreshResponse>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((response) => this.accessToken.set(response.token)),
        // map: de la respuesta { token } me quedo solo con el texto del token
        map((response) => response.token),
      );
  }

  /** Cierra la sesión: avisa a la API para que borre la cookie y olvide el token, y limpia lo local */
  logout(): void {
    // EXPLICAR EN EL VÍDEO
    this.http
      .post(`${this.baseUrl}/logout`, {}, { withCredentials: true })
      .pipe(finalize(() => this.clearSession()))
      .subscribe({ error: () => {} });
  }

  // EXPLICAR EN EL VÍDEO
  clearLocalSession(): void {
  this.accessToken.set(null);
  this.currentUser.set(null);
  localStorage.removeItem(USER_KEY);
}

/** Limpia la sesión y lleva al login */
clearSession(): void {
  this.clearLocalSession();
  this.router.navigate(['/login']);
}

  /** El access token en memoria, o null si no hay sesión. Lo usa el interceptor */
  getToken(): string | null {
    // EXPLICAR EN EL VÍDEO
    return this.accessToken();
  }

  
}