import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
// EXPLICAR EN EL VÍDEO
import {
  BookCreatedEvent,
  ChatMessage,
  ChatService,
  ChatUser,
} from '../../services/chat.service';

type ChatLevel = 'general' | 'group' | 'direct';

// Un usuario de la lista, con su estado de conexión
export interface ChatPerson extends ChatUser {
  online: boolean;
}

@Component({
  selector: 'app-chat',
  imports: [FormsModule, DatePipe],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chat implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly subscriptions = new Subscription();

  readonly chatLevel = signal<ChatLevel>('general');
  readonly connected = signal(false);
  readonly users = signal<ChatUser[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly selectedUserId = signal('');
  readonly groupId = signal('');
  readonly messageText = signal('');
  readonly error = signal('');
  readonly activeRoom = signal('general');
  readonly onlineIds = signal<string[]>([]);

  // EXPLICAR EN EL VÍDEO
  readonly newBook = signal<BookCreatedEvent | null>(null);

  // El usuario con sesión, para mostrarlo el primero de la lista como "tú"
  readonly me = this.authService.user;

  // Los demás usuarios con su estado: primero los conectados y después por nombre.
  // computed se recalcula solo cuando cambia la lista de usuarios o la de conectados.
  readonly people = computed<ChatPerson[]>(() => {
    const online = new Set(this.onlineIds());
    return this.users()
      .map((user) => ({ ...user, online: online.has(user._id) }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  });

  // Cuántos están conectados, contando al propio usuario si su socket está abierto
  readonly onlineCount = computed(
    () => this.people().filter((person) => person.online).length + (this.connected() ? 1 : 0),
  );

  ngOnInit(): void {
    // Suscribirse antes de conectar evita perder eventos que lleguen pronto.
    this.subscriptions.add(
      this.chatService.connectionStatus$.subscribe((connected) => {
        this.connected.set(connected);
        if (connected) {
          this.joinActiveRoom();
        }
      }),
    );

    this.subscriptions.add(
      this.chatService.connectionError$.subscribe((error) => {
        this.error.set(`No se pudo conectar al chat: ${error.message}`);
      }),
    );

    this.subscriptions.add(
      this.chatService.history$.subscribe((history) => {
        // Los mensajes antiguos de otras salas se ignoran si ya cambiamos de sala.
        this.messages.set(history.filter((message) => message.room === this.activeRoom()));
      }),
    );

    this.subscriptions.add(
      this.chatService.messages$.subscribe((message) => {
        // El servidor puede seguir enviando mensajes de salas anteriores.
        if (message.room === this.activeRoom()) {
          this.messages.update((messages) => [...messages, message]);
        }
      }),
    );

    this.subscriptions.add(
      this.chatService.onlineUsers$.subscribe((userIds) => this.onlineIds.set(userIds)),
    );

    this.subscriptions.add(
      this.chatService.chatError$.subscribe((error) => {
        this.error.set(error.message);
      }),
    );

    // EXPLICAR EN EL VÍDEO
    this.subscriptions.add(
      this.chatService.bookCreated$.subscribe((book) => this.newBook.set(book)),
    );

    this.subscriptions.add(
      this.chatService.getUsers().subscribe({
        next: (users) => {
          const currentUserId = this.authService.user()?._id;
          this.users.set(users.filter((user) => user._id !== currentUserId));
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(`No se pudo cargar la lista de usuarios: ${error.message}`);
        },
      }),
    );

    try {
      this.chatService.connect();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'No se pudo iniciar la conexión del chat.',
      );
    }
  }

  setChatLevel(level: ChatLevel): void {
    this.chatLevel.set(level);

    if (level === 'general') {
      this.activeRoom.set('general');
    } else if (level === 'group') {
      this.activeRoom.set(this.groupId().trim() ? `group:${this.groupId().trim()}` : '');
    } else {
      this.activeRoom.set(this.directRoom());
    }

    this.messages.set([]);
    this.error.set('');
    this.joinActiveRoom();
  }

  setGroupId(groupId: string): void {
    this.groupId.set(groupId);
  }

  openGroupRoom(): void {
    const groupId = this.groupId().trim();
    if (!groupId) {
      this.error.set('Escribe el identificador del grupo.');
      return;
    }

    this.activeRoom.set(`group:${groupId}`);
    this.messages.set([]);
    this.error.set('');
    this.joinActiveRoom();
  }

  selectDirectUser(userId: string): void {
    this.selectedUserId.set(userId);
    if (this.chatLevel() === 'direct') {
      this.activeRoom.set(this.directRoom());
      this.messages.set([]);
      this.joinActiveRoom();
    }
  }

  // Pulsar un usuario de la lista abre el chat directo con él
  openDirect(userId: string): void {
    this.selectedUserId.set(userId);
    this.setChatLevel('direct');
  }

  sendMessage(): void {
    const text = this.messageText().trim();
    if (!text || !this.activeRoom() || !this.connected()) {
      return;
    }

    try {
      this.chatService.sendMessage(this.activeRoom(), text);
      this.messageText.set('');
      this.error.set('');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    }
  }

  ngOnDestroy(): void {
    // Cancela todas las suscripciones y cierra el socket al salir del componente.
    this.subscriptions.unsubscribe();
    this.chatService.disconnect();
  }

  private joinActiveRoom(): void {
    if (!this.connected() || !this.activeRoom()) {
      return;
    }

    try {
      this.chatService.joinRoom(this.activeRoom());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo entrar en la sala.');
    }
  }

  private directRoom(): string {
    const currentUserId = this.authService.user()?._id;
    const otherUserId = this.selectedUserId();

    if (!currentUserId || !otherUserId) {
      return '';
    }

    // Ambos usuarios generan el mismo identificador, sin importar quién inicia el chat.
    const [firstId, secondId] = [currentUserId, otherUserId].sort();
    return `direct:${firstId}:${secondId}`;
  }
}