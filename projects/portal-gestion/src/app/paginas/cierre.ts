import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, takeWhile, timer } from 'rxjs';
import {
  ApiBanquito,
  Cargando,
  ChipEstado,
  CierreRespuesta,
  EtapaCierreRespuesta,
  FechaNegocioService,
  FechaPipe,
  Icono,
  Vacio,
} from 'shared';

const ETAPAS = [
  'Recaudaciones',
  'Devengo de intereses',
  'Interés de mora',
  'Clasificación de cartera',
  'Provisiones, castigo y cuadre contable',
  'Fotografía de la cartera',
];

@Component({
  selector: 'pg-cierre',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, Cargando, Vacio, ChipEstado, FechaPipe],
  templateUrl: './cierre.html',
  styleUrl: './cierre.css',
})
export class Cierre {
  private readonly api = inject(ApiBanquito);
  private readonly destruir = inject(DestroyRef);
  protected readonly fechaNegocio = inject(FechaNegocioService);

  protected readonly cierres = signal<CierreRespuesta[]>([]);
  protected readonly etapas = signal<EtapaCierreRespuesta[]>([]);
  protected readonly seleccionada = signal('');
  protected readonly cargando = signal(true);
  protected readonly ejecutando = signal(false);
  protected readonly error = signal('');
  protected readonly progreso = signal<CierreRespuesta | null>(null);
  protected readonly nombresEtapa = ETAPAS;

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.listarCierres().subscribe({
      next: (valor) => {
        this.cierres.set(valor);
        this.cargando.set(false);
      },
      error: () => {
        this.cierres.set([]);
        this.cargando.set(false);
      },
    });
  }

  protected ejecutar(): void {
    this.ejecutando.set(true);
    this.error.set('');
    this.api.iniciarCierre().subscribe({
      next: (cierre) => this.seguir(cierre),
      error: (fallo: Error) => {
        this.error.set(fallo.message || 'No fue posible ejecutar el cierre');
        this.ejecutando.set(false);
      },
    });
  }

  private seguir(cierre: CierreRespuesta): void {
    this.progreso.set(cierre);
    timer(1500, 1500)
      .pipe(
        switchMap(() => this.api.detalleCierre(cierre.fechaNegocio)),
        takeWhile((actual) => actual.estado === 'EN_CIERRE', true),
        takeUntilDestroyed(this.destruir),
      )
      .subscribe({
        next: (actual) => {
          this.progreso.set(actual);
          if (actual.estado !== 'EN_CIERRE') {
            this.terminar(actual);
          }
        },
        error: (fallo: Error) => {
          this.error.set(fallo.message || 'No fue posible consultar el avance del cierre');
          this.ejecutando.set(false);
        },
      });
  }

  private terminar(cierre: CierreRespuesta): void {
    this.ejecutando.set(false);
    this.progreso.set(null);
    if (cierre.estado !== 'CERRADO') {
      this.error.set(
        cierre.observacion || `El cierre quedó en estado ${cierre.estado}; puede reintentarlo`,
      );
    }
    this.cargar();
    this.fechaNegocio.cargar();
  }

  protected reintentar(fecha: string): void {
    this.ejecutando.set(true);
    this.error.set('');
    this.api.reintentarCierre(fecha).subscribe({
      next: (cierre) => this.seguir(cierre),
      error: (fallo: Error) => {
        this.error.set(fallo.message || 'No fue posible reintentar el cierre');
        this.ejecutando.set(false);
      },
    });
  }

  protected verEtapas(fecha: string): void {
    if (this.seleccionada() === fecha) {
      this.seleccionada.set('');
      return;
    }
    this.seleccionada.set(fecha);
    this.api.etapasCierre(fecha).subscribe((valor) => this.etapas.set(valor));
  }

  protected nombreEtapa(numero: number): string {
    return ETAPAS[numero - 1] ?? `Etapa ${numero}`;
  }
}
