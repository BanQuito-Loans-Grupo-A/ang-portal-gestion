import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiBanquito, Cargando, CargoMoraCuota, ChipEstado, CuadroAbono, CuotaTabla, DesglosePrelacion, DineroPipe,
  Enfocar, EtiquetaPipe, FechaPipe, Icono, Liquidacion, Rango, ModalidadAbono, MovimientoEstado, OperacionDetalle,
  PagoAplicado, TasaPipe, mensajeDe,
} from 'shared';
import { SesionService } from 'shared';

@Component({
  selector: 'pg-operacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icono, Cargando, ChipEstado, DineroPipe, FechaPipe, TasaPipe, EtiquetaPipe, Enfocar, Rango],
  templateUrl: './operacion.html',
  styleUrl: './operacion.css',
})
export class Operacion {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sesion = inject(SesionService);
  private readonly numero = this.ruta.snapshot.paramMap.get('numero') ?? '';
  private readonly dinero = new DineroPipe();

  protected readonly operacion = signal<OperacionDetalle | null>(null);
  protected readonly cuotas = signal<CuotaTabla[]>([]);
  protected readonly estados = signal<MovimientoEstado[]>([]);
  protected readonly pagos = signal<PagoAplicado[]>([]);
  protected readonly cargosMora = signal<CargoMoraCuota[]>([]);
  protected readonly cuadro = signal<CuadroAbono | null>(null);
  protected readonly prelacion = signal<DesglosePrelacion | null>(null);
  protected readonly liquidacion = signal<Liquidacion | null>(null);
  protected readonly tablaActualizada = signal(0);
  private recienDesembolsada = false;
  protected readonly abonoMinimo = signal(50);
  protected readonly cargando = signal(true);
  protected readonly procesando = signal(false);
  protected readonly error = signal('');
  protected readonly mensaje = signal('');

  protected readonly pendientes = computed(() => this.cuotas().filter((cuota) => cuota.estado !== 'PAGADA'));
  protected readonly cuotaPendiente = computed(() => this.pendientes()[0] ?? null);
  protected readonly cuotasPendientes = computed(() => this.pendientes().length);
  protected readonly abonoMaximo = computed(() => this.operacion()?.saldoCapital ?? null);
  protected readonly ultimaCuota = computed(() => this.cuotas()[this.cuotas().length - 1] ?? null);

  protected readonly abono = this.fb.nonNullable.group({
    monto: [2000, [Validators.required, Validators.min(50)]],
    modalidad: ['REDUCIR_CUOTA' as ModalidadAbono, Validators.required],
  });

  constructor() {
    if (this.ruta.snapshot.queryParamMap.get('desembolsada')) {
      this.recienDesembolsada = true;
      this.tablaActualizada.set(1);
    }
    this.cargarDatos();
    this.api.parametros().subscribe((parametros) => {
      const minimo = parametros.find((parametro) => parametro.codigo === 'PAR-12')?.valorNumerico;
      if (minimo) {
        this.abonoMinimo.set(minimo);
        this.limitarAbono();
      }
    });
  }

  private cargarDatos(): void {
    this.api.detalleOperacion(this.numero).subscribe({
      next: (valor) => {
        this.operacion.set(valor);
        this.limitarAbono();
        if (this.recienDesembolsada) {
          this.recienDesembolsada = false;
          this.mensaje.set(`Préstamo ${valor.numeroPrestamo} desembolsado: de ${this.dinero.transform(valor.montoAprobado)} se retuvieron `
            + `${this.dinero.transform(valor.contribucionSolca)} de contribución SOLCA y se acreditan ${this.dinero.transform(valor.montoNeto)} `
            + `en la cuenta ${valor.cuentaDestino}.`);
        }
        this.cargando.set(false);
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'No fue posible cargar la operación'));
        this.cargando.set(false);
      },
    });
    this.api.tablaAmortizacion(this.numero).subscribe((valor) => this.cuotas.set(valor));
    this.api.movimientosEstado(this.numero).subscribe((valor) => this.estados.set(valor));
    this.api.pagosDeOperacion(this.numero, 0).subscribe((pagina) => this.pagos.set(pagina.content));
    this.api.cargosMora(this.numero).subscribe({
      next: (valor) => this.cargosMora.set(valor.filter((cargo) => cargo.moraAcumulada > 0)),
      error: () => this.cargosMora.set([]),
    });
  }

  private limitarAbono(): void {
    const validadores = [Validators.required, Validators.min(this.abonoMinimo())];
    const maximo = this.abonoMaximo();
    if (maximo !== null) {
      validadores.push(Validators.max(maximo));
    }
    this.abono.controls.monto.setValidators(validadores);
    this.abono.controls.monto.updateValueAndValidity();
  }

  private idAnalista(): number {
    return this.sesion.sesion()?.idAnalista ?? 1;
  }

  protected simularAbono(): void {
    if (this.abono.invalid) {
      this.abono.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.mensaje.set('');
    this.prelacion.set(null);
    this.procesando.set(true);
    this.api.simularAbono(this.numero, this.abono.getRawValue()).subscribe({
      next: (valor) => {
        this.cuadro.set(valor);
        this.procesando.set(false);
      },
      error: (fallo) => {
        this.cuadro.set(null);
        this.error.set(mensajeDe(fallo, 'No fue posible simular el abono'));
        this.procesando.set(false);
      },
    });
  }

  protected registrarAbono(): void {
    this.procesando.set(true);
    this.api.registrarAbono(this.numero, this.abono.getRawValue(), this.idAnalista()).subscribe({
      next: (valor) => {
        this.cuadro.set(null);
        this.prelacion.set(valor.pagoPorPrelacion);
        this.mensaje.set(
          valor.tratamiento === 'ABONO_EXTRAORDINARIO'
            ? `Abono extraordinario registrado con el pago ${valor.idPago}. La tabla se recalculó.`
            : `La operación tenía cuotas vencidas, así que el valor se aplicó por prelación en el pago ${valor.idPago}. La tabla no se recalculó.`,
        );
        this.procesando.set(false);
        this.cargarDatos();
        this.tablaActualizada.update((valor) => valor + 1);
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'No fue posible registrar el abono'));
        this.procesando.set(false);
      },
    });
  }

  protected consultarLiquidacion(): void {
    this.error.set('');
    this.mensaje.set('');
    this.api.liquidacion(this.numero).subscribe({
      next: (valor) => this.liquidacion.set(valor),
      error: (fallo) => this.error.set(mensajeDe(fallo, 'No fue posible calcular la liquidación')),
    });
  }

  protected cancelar(): void {
    this.procesando.set(true);
    this.api.cancelar(this.numero, this.idAnalista()).subscribe({
      next: (valor) => {
        this.mensaje.set(`Operación cancelada con el pago ${valor.idPago}`);
        this.liquidacion.set(null);
        this.procesando.set(false);
        this.cargarDatos();
        this.tablaActualizada.update((valor) => valor + 1);
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'No fue posible cancelar la operación'));
        this.procesando.set(false);
      },
    });
  }
}
