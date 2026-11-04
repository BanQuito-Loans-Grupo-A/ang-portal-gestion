import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ApiBanquito, Cargando, CierreRespuesta, DineroPipe, EvolucionTramo, FechaPipe, Icono, ReporteComposicionTramos,
  ReporteMorosidad, ReporteRollRate, ReporteSaludPortafolio, TasaPipe, mensajeDe,
} from 'shared';

type Vista = 'morosidad' | 'tramos' | 'salud' | 'roll';
type Celda = string | number | null | undefined;

function celda(valor: Celda): string {
  if (valor === null || valor === undefined) {
    return '';
  }
  const texto = typeof valor === 'number' ? String(valor).replace('.', ',') : valor;
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function descargarCsv(nombre: string, filas: Celda[][]): void {
  const contenido = '\uFEFF' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

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

  protected hayDatos(): boolean {
    const datos: Record<Vista, unknown> = {
      morosidad: this.morosidad(),
      tramos: this.tramos(),
      salud: this.salud(),
      roll: this.roll(),
    };
    return !this.cargando() && !!datos[this.vista()];
  }

  protected descargar(): void {
    const morosidad = this.morosidad();
    const tramos = this.tramos();
    const salud = this.salud();
    const roll = this.roll();
    if (this.vista() === 'morosidad' && morosidad) {
      descargarCsv(`indice_morosidad_${morosidad.fechaCorte}.csv`, [
        ['Indicador', 'Valor'],
        ['Fecha de corte', morosidad.fechaCorte],
        ['Saldo cartera vencida', morosidad.saldoVencida],
        ['Saldo cartera en litigio', morosidad.saldoEnLitigio],
        ['Saldo vencida y en litigio', morosidad.saldoVencidaYEnLitigio],
        ['Cartera bruta', morosidad.carteraBruta],
        ['Índice de morosidad (%)', morosidad.indiceMorosidad],
        ['Cartera castigada', morosidad.saldoCastigada],
      ]);
    } else if (this.vista() === 'tramos' && tramos) {
      descargarCsv(`composicion_tramos_${tramos.fechaCorte}.csv`, [
        ['Tramo', 'Estado', 'Operaciones', 'Saldo de capital', '% del total', 'Provisión'],
        ...tramos.tramos.map((fila) => [fila.numeroTramo, fila.estadoCartera, fila.operaciones, fila.saldoCapital,
          fila.porcentajeSaldo, fila.provision]),
        ['Total', '', tramos.total.operaciones, tramos.total.saldoCapital, tramos.total.porcentajeSaldo,
          tramos.total.provision],
      ]);
    } else if (this.vista() === 'salud' && salud) {
      const grupos: Array<[string, typeof salud.distribucionPorMonto]> = [
        ['Por monto original', salud.distribucionPorMonto],
        ['Por plazo', salud.distribucionPorPlazo],
        ['Por sistema de amortización', salud.distribucionPorSistema],
      ];
      descargarCsv(`salud_portafolio_${salud.fechaCorte}.csv`, [
        ['Indicador', 'Valor'],
        ['Fecha de corte', salud.fechaCorte],
        ['Índice de morosidad (%)', salud.indiceMorosidad],
        ['Cobertura de provisiones (%)', salud.coberturaProvisiones],
        ['Concentración diez mayores clientes (%)', salud.concentracionDiezMayores],
        [],
        ['Distribución', 'Categoría', 'Operaciones', 'Saldo de capital', '% del saldo'],
        ...grupos.flatMap(([titulo, filas]) => filas.map((fila) => [titulo, fila.categoria, fila.operaciones,
          fila.saldoCapital, fila.porcentajeSaldo])),
      ]);
    } else if (this.vista() === 'roll' && roll) {
      descargarCsv(`matriz_maduracion_${roll.fechaInicial}_${roll.fechaFinal}.csv`, [
        ['Tramo inicial', 'Operaciones del tramo', 'Saldo inicial del tramo', 'Destino', 'Evolución',
          'Operaciones', 'Saldo', '% del saldo'],
        ...roll.filas.flatMap((fila) => fila.destinos.map((destino) => [fila.tramoInicial, fila.operaciones,
          fila.saldoInicial, this.nombreDestino(destino.destino), this.textoEvolucion(destino.evolucion),
          destino.operaciones, destino.saldoInicial, destino.porcentajeSaldo])),
      ]);
    }
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
    const previas = cerrados.filter((fecha) => fecha < corte);
    const inicial = anteriores.length ? anteriores[anteriores.length - 1] : previas.length ? previas[0] : corte;
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
      if (fechaInicial >= fechaCorte) {
        this.error.set('La fecha inicial debe ser anterior a la fecha final');
        terminar();
        return;
      }
      this.api.reporteRollRate(fechaInicial, fechaCorte).subscribe({ next: (v) => { this.roll.set(v); terminar(); }, error: fallar });
    }
  }
}
