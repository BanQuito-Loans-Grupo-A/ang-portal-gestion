import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApiBanquito,
  Cargando,
  ChipEstado,
  DineroPipe,
  EtiquetaPipe,
  Icono,
  OperacionResumen,
  Vacio,
} from 'shared';

@Component({
  selector: 'pg-operaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Icono,
    Cargando,
    Vacio,
    ChipEstado,
    DineroPipe,
    EtiquetaPipe,
  ],
  templateUrl: './operaciones.html',
  styleUrl: './operaciones.css',
})
export class Operaciones {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);

  protected readonly operaciones = signal<OperacionResumen[]>([]);
  protected readonly cargando = signal(false);
  protected readonly buscado = signal(false);

  protected readonly formulario = this.fb.nonNullable.group({ termino: [''] });

  protected buscar(): void {
    const termino = this.formulario.getRawValue().termino.trim();
    if (!termino) {
      this.buscado.set(false);
      this.operaciones.set([]);
      return;
    }
    this.buscado.set(true);
    this.cargando.set(true);
    const filtro = /^\d{10}$/.test(termino) ? { identificacion: termino } : { numero: termino };
    this.api.buscarOperaciones(filtro, 0).subscribe({
      next: (pagina) => {
        this.operaciones.set(pagina.content);
        this.cargando.set(false);
      },
      error: () => {
        this.operaciones.set([]);
        this.cargando.set(false);
      },
    });
  }
}
