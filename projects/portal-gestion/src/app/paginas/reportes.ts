import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ApiBanquito, Cargando, CierreRespuesta, DineroPipe, EvolucionTramo, FechaPipe, Icono, ReporteComposicionTramos,
  ReporteMorosidad, ReporteRollRate, ReporteSaludPortafolio, TasaPipe, mensajeDe,
} from 'shared';

type Vista = 'morosidad' | 'tramos' | 'salud' | 'roll';

@Component({
  selector: 'pg-reportes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icono, Cargando, DineroPipe, FechaPipe, TasaPipe],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);

  protected readonly vista = signal<Vista>('morosidad');
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly morosidad = signal<ReporteMorosidad | null>(null);
  protected readonly tramos = signal<ReporteComposicionTramos | null>(null);
  protected readonly salud = signal<ReporteSaludPortafolio | null>(null);
  protected readonly roll = signal<ReporteRollRate | null>(null);

  protected readonly vistas: Array<{ id: Vista; texto: string }> = [
    { id: 'morosidad', texto: 'Índice de morosidad' },
    { id: 'tramos', texto: 'Composición por tramos' },
    { id: 'salud', texto: 'Salud y concentración' },
    { id: 'roll', texto: 'Matriz de maduración' },
  ];

  protected readonly formulario = this.fb.nonNullable.group({
    fechaCorte: ['', Validators.required],
    fechaInicial: ['', Validators.required],
  });

  constructor() {
    this.api.listarCierres().subscribe({
      next: (cierres) => this.iniciarFechas(cierres),
      error: (fallo) => this.error.set(mensajeDe(fallo, 'No fue posible consultar los días cerrados')),
    });
  }

  protected nombreDestino(destino: string): string {
    return destino === 'CANCELADA' ? 'Cancelada' : destino.replace('TRAMO_', 'Tramo ');
  }

  protected claseEvolucion(evolucion: EvolucionTramo): string {
    const clases: Record<EvolucionTramo, string> = {
      MEJORO: 'bq-chip bq-chip--exito',
      SE_MANTUVO: 'bq-chip',
      EMPEORO: 'bq-chip bq-chip--error',
      CANCELADA: 'bq-chip bq-chip--marca',
    };
    return clases[evolucion];
  }

  protected textoEvolucion(evolucion: EvolucionTramo): string {
    const textos: Record<EvolucionTramo, string> = {
      MEJORO: 'Mejoró de tramo',
      SE_MANTUVO: 'Se mantuvo en el tramo',
      EMPEORO: 'Empeoró de tramo',
      CANCELADA: 'La operación se canceló',
    };
    return textos[evolucion];
  }

  private iniciarFechas(cierres: CierreRespuesta[]): void {
    const cerrados = cierres
      .filter((cierre) => cierre.estado === 'CERRADO')
      .map((cierre) => cierre.fechaNegocio)
      .sort();
    if (!cerrados.length) {
      this.error.set('Todavía no hay días cerrados: los reportes se generan a partir del primer cierre de día');
      return;
    }
    const corte = cerrados[cerrados.length - 1];
    const limite = new Date(`${corte}T00:00:00`);
    limite.setMonth(limite.getMonth() - 1);
    const tope = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
    const anteriores = cerrados.filter((fecha) => fecha <= tope);
    const inicial = anteriores.length ? anteriores[anteriores.length - 1] : cerrados[0];
    this.formulario.setValue({ fechaCorte: corte, fechaInicial: inicial });
    this.consultar();
  }

  protected seleccionar(id: Vista): void {
    this.vista.set(id);
    this.consultar();
  }

  protected consultar(): void {
    if (this.formulario.invalid) {
      return;
    }
    const { fechaCorte, fechaInicial } = this.formulario.getRawValue();
    this.cargando.set(true);
    this.error.set(null);
    const terminar = () => this.cargando.set(false);
    const fallar = (fallo: unknown) => {
      this.error.set(mensajeDe(fallo, 'No fue posible generar el reporte'));
      terminar();
    };

    if (this.vista() === 'morosidad') {
      this.morosidad.set(null);
      this.api.reporteMorosidad(fechaCorte).subscribe({ next: (v) => { this.morosidad.set(v); terminar(); }, error: fallar });
    } else if (this.vista() === 'tramos') {
      this.tramos.set(null);
      this.api.reporteComposicion(fechaCorte).subscribe({ next: (v) => { this.tramos.set(v); terminar(); }, error: fallar });
    } else if (this.vista() === 'salud') {
      this.salud.set(null);
      this.api.reporteSalud(fechaCorte).subscribe({ next: (v) => { this.salud.set(v); terminar(); }, error: fallar });
    } else {
      this.roll.set(null);
      this.api.reporteRollRate(fechaInicial, fechaCorte).subscribe({ next: (v) => { this.roll.set(v); terminar(); }, error: fallar });
    }
  }
}
