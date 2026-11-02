import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiBanquito, Cargando, FechaPipe, Icono, Parametro, TramoCartera } from 'shared';

@Component({
  selector: 'pg-parametros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, Cargando, FechaPipe],
  templateUrl: './parametros.html',
  styleUrl: './parametros.css',
})
export class Parametros {
  private readonly api = inject(ApiBanquito);

  protected readonly parametros = signal<Parametro[]>([]);
  protected readonly tramos = signal<TramoCartera[]>([]);
  protected readonly cargando = signal(true);

  constructor() {
    this.api.parametros().subscribe({
      next: (valor) => {
        this.parametros.set(valor);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
    this.api.tramosCartera().subscribe((valor) => this.tramos.set(valor));
  }
}
