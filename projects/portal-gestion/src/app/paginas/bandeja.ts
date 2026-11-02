import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApiBanquito,
  Cargando,
  DineroPipe,
  EtiquetaPipe,
  FechaPipe,
  Icono,
  SesionService,
  SolicitudBandeja,
  TasaPipe,
  Vacio,
  mensajeDe,
} from 'shared';

@Component({
  selector: 'pg-bandeja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Icono,
    Cargando,
    Vacio,
    DineroPipe,
    FechaPipe,
    TasaPipe,
    EtiquetaPipe,
  ],
  templateUrl: './bandeja.html',
  styleUrl: './bandeja.css',
})
export class Bandeja {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly tasa = new TasaPipe();

  protected readonly solicitudes = signal<SolicitudBandeja[]>([]);
  protected readonly cargando = signal(true);
  protected readonly seleccionada = signal<SolicitudBandeja | null>(null);
  protected readonly mensaje = signal('');
  protected readonly error = signal('');
  protected readonly procesando = signal(false);
  protected readonly vista = signal<'REGISTRADA' | 'APROBADA'>('REGISTRADA');
  protected readonly desembolsada = signal('');

  protected readonly aprobacion = this.fb.nonNullable.group({
    tea: [16, [Validators.required, Validators.min(0.01), Validators.max(16.77)]],
  });

  protected readonly rechazo = this.fb.nonNullable.group({
    motivo: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.bandejaSolicitudes(this.vista(), 0).subscribe({
      next: (pagina) => {
        this.solicitudes.set(pagina.content);
        this.cargando.set(false);
      },
      error: () => {
        this.solicitudes.set([]);
        this.cargando.set(false);
      },
    });
  }

  protected cambiarVista(vista: 'REGISTRADA' | 'APROBADA'): void {
    if (this.vista() === vista) {
      return;
    }
    this.vista.set(vista);
    this.mensaje.set('');
    this.desembolsada.set('');
    this.error.set('');
    this.cargar();
  }

  protected desembolsar(solicitud: SolicitudBandeja): void {
    this.procesando.set(true);
    this.error.set('');
    this.mensaje.set('');
    this.desembolsada.set('');
    this.api
      .desembolsar({ solicitudId: solicitud.idSolicitud, idAnalista: this.idAnalista() })
      .subscribe({
        next: (operacion) => {
          this.mensaje.set(
            `Préstamo ${operacion.numeroPrestamo} desembolsado a ${solicitud.nombreCompletoCliente}`,
          );
          this.desembolsada.set(operacion.numeroPrestamo);
          this.procesando.set(false);
          this.cargar();
        },
        error: (fallo) => {
          this.error.set(mensajeDe(fallo, 'No fue posible desembolsar la solicitud'));
          this.procesando.set(false);
        },
      });
  }

  private idAnalista(): number {
    return this.sesion.sesion()?.idAnalista ?? 1;
  }

  protected cumple(solicitud: SolicitudBandeja): boolean {
    return solicitud.cuotaProyectada <= solicitud.cuotaMaximaAdmisible;
  }

  protected ancho(solicitud: SolicitudBandeja): number {
    return Math.min(100, Math.max(0, solicitud.porcentajeCuotaSobreRemanente));
  }

  protected seleccionar(solicitud: SolicitudBandeja): void {
    this.seleccionada.set(solicitud);
    this.mensaje.set('');
    this.error.set('');
  }

  protected cerrar(): void {
    this.seleccionada.set(null);
  }

  protected aprobar(): void {
    const solicitud = this.seleccionada();
    if (!solicitud || this.aprobacion.invalid) {
      this.aprobacion.markAllAsTouched();
      return;
    }
    this.procesando.set(true);
    this.error.set('');
    this.api
      .aprobarSolicitud(solicitud.idSolicitud, {
        tea: this.aprobacion.getRawValue().tea,
        idAnalista: this.idAnalista(),
      })
      .subscribe({
        next: (respuesta) => {
          this.mensaje.set(
            `Solicitud ${respuesta.idSolicitud} aprobada con una TEA de ${this.tasa.transform(respuesta.teaAsignada)}. Ya está en Por desembolsar.`,
          );
          this.procesando.set(false);
          this.seleccionada.set(null);
          this.cargar();
        },
        error: (fallo) => {
          this.error.set(mensajeDe(fallo, 'No fue posible aprobar la solicitud'));
          this.procesando.set(false);
        },
      });
  }

  protected rechazar(): void {
    const solicitud = this.seleccionada();
    if (!solicitud || this.rechazo.invalid) {
      this.rechazo.markAllAsTouched();
      return;
    }
    this.procesando.set(true);
    this.error.set('');
    this.api
      .rechazarSolicitud(solicitud.idSolicitud, {
        motivo: this.rechazo.getRawValue().motivo,
        idAnalista: this.idAnalista(),
      })
      .subscribe({
        next: (respuesta) => {
          this.mensaje.set(`Solicitud ${respuesta.idSolicitud} rechazada`);
          this.procesando.set(false);
          this.seleccionada.set(null);
          this.rechazo.reset();
          this.cargar();
        },
        error: (fallo) => {
          this.error.set(mensajeDe(fallo, 'No fue posible rechazar la solicitud'));
          this.procesando.set(false);
        },
      });
  }
}
