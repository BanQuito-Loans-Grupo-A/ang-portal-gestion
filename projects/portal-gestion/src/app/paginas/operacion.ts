import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiBanquito, Cargando, ChipEstado, CuadroAbono, CuotaTabla, DesglosePrelacion, DineroPipe,
  EtiquetaPipe, FechaPipe, Icono, Liquidacion, ModalidadAbono, MovimientoEstado, OperacionDetalle,
  TasaPipe, mensajeDe,
} from 'shared';
import { SesionService } from 'shared';

@Component({
  selector: 'pg-operacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icono, Cargando, ChipEstado, DineroPipe, FechaPipe, TasaPipe, EtiquetaPipe],
  templateUrl: './operacion.html',
  styleUrl: './operacion.css',
})
export class Operacion {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sesion = inject(SesionService);
  private readonly numero = this.ruta.snapshot.paramMap.get('numero') ?? '';

  protected readonly operacion = signal<OperacionDetalle | null>(null);
  protected readonly cuotas = signal<CuotaTabla[]>([]);
  protected readonly estados = signal<MovimientoEstado[]>([]);
  protected readonly cuadro = signal<CuadroAbono | null>(null);
  protected readonly prelacion = signal<DesglosePrelacion | null>(null);
  protected readonly liquidacion = signal<Liquidacion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly mensaje = signal('');

  protected readonly abono = this.fb.nonNullable.group({
    monto: [2000, [Validators.required, Validators.min(50)]],
    modalidad: ['REDUCIR_CUOTA' as ModalidadAbono, Validators.required],
  });

  constructor() {
    this.api.detalleOperacion(this.numero).subscribe({
      next: (valor) => {
        this.operacion.set(valor);
        this.cargando.set(false);
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'No fue posible cargar la operación'));
        this.cargando.set(false);
      },
    });
    this.api.tablaAmortizacion(this.numero).subscribe((valor) => this.cuotas.set(valor));
    this.api.movimientosEstado(this.numero).subscribe((valor) => this.estados.set(valor));
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
    this.api.simularAbono(this.numero, this.abono.getRawValue()).subscribe({
      next: (valor) => this.cuadro.set(valor),
      error: (fallo) => this.error.set(mensajeDe(fallo, 'No fue posible simular el abono')),
    });
  }

  protected registrarAbono(): void {
    this.api.registrarAbono(this.numero, this.abono.getRawValue(), this.idAnalista()).subscribe({
      next: (valor) => {
        this.cuadro.set(null);
        this.prelacion.set(valor.pagoPorPrelacion);
        this.mensaje.set(
          valor.tratamiento === 'ABONO_EXTRAORDINARIO'
            ? `Abono extraordinario registrado con el pago ${valor.idPago}. La tabla se recalculó.`
            : `La operación tenía cuotas vencidas, así que el valor se aplicó por prelación en el pago ${valor.idPago}. La tabla no se recalculó.`,
        );
      },
      error: (fallo) => this.error.set(mensajeDe(fallo, 'No fue posible registrar el abono')),
    });
  }

  protected consultarLiquidacion(): void {
    this.error.set('');
    this.api.liquidacion(this.numero).subscribe({
      next: (valor) => this.liquidacion.set(valor),
      error: (fallo) => this.error.set(mensajeDe(fallo, 'No fue posible calcular la liquidación')),
    });
  }

  protected cancelar(): void {
    this.api.cancelar(this.numero, this.idAnalista()).subscribe({
      next: (valor) => {
        this.mensaje.set(`Operación cancelada con el pago ${valor.idPago}`);
        this.liquidacion.set(null);
      },
      error: (fallo) => this.error.set(mensajeDe(fallo, 'No fue posible cancelar la operación')),
    });
  }
}
