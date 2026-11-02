import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Api } from '../../core/api/generated/api';
import { getSetCandidates } from '../../core/api/generated/fn/sets/get-set-candidates';
import { SetCandidatesResponse } from '../../core/api/generated/models';
import { AppError, toAppError } from '../../core/api-error';
import { AppFooter } from '../../shared/ui/app-footer.component';
import { SetCard } from './set-card.component';

const RESULT_LIMIT = 5;

@Component({
  selector: 'app-results-page',
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterLink,
    AppFooter,
    SetCard,
  ],
  templateUrl: './results.page.html',
  styleUrl: './results.page.scss',
})
export class ResultsPage {
  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  private readonly api = inject(Api);

  protected readonly loading = signal(true);
  protected readonly error = signal<AppError | null>(null);
  protected readonly response = signal<SetCandidatesResponse | null>(null);
  protected readonly candidates = computed(() => this.response()?.candidates ?? []);
  /** 503 means the catalog import is still running, which is temporary and worth a retry. */
  protected readonly catalogLoading = computed(() => this.error()?.status === 503);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  protected retry(): Promise<void> {
    return this.load(this.id());
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.response.set(await this.api.invoke(getSetCandidates, { scanId: id, limit: RESULT_LIMIT }));
    } catch (error) {
      this.response.set(null);
      this.error.set(toAppError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
