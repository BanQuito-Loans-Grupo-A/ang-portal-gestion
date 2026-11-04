import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ApiBanquito,
  Cargando,
  DineroPipe,
  Enfocar,
  EtiquetaPipe,
  FechaPipe,
  Icono,
  Rango,
  SesionService,
  SolicitudBandeja,
  SolicitudResumen,
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
    Rango,
    Cargando,
    Vacio,
    DineroPipe,
    FechaPipe,
    TasaPipe,
    EtiquetaPipe,
    Enfocar,
  ],
  templateUrl: './bandeja.html',
  styleUrl: './bandeja.css',
})
export class Bandeja {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly tasa = new TasaPipe();

  protected readonly solicitudes = signal<SolicitudBandeja[]>([]);
  protected readonly cargando = signal(true);
  protected readonly seleccionada = signal<SolicitudBandeja | null>(null);
  protected readonly mensaje = signal('');
  protected readonly error = signal('');
  protected readonly procesando = signal(false);
  protected readonly vista = signal<'REGISTRADA' | 'APROBADA'>('REGISTRADA');
  protected readonly desembolsada = signal('');
  protected readonly teaMaxima = signal(16.77);
  protected readonly teaMinima = signal(15.5);
  protected readonly porcentajeSolca = signal(0.5);
  protected readonly rechazar = signal(false);
  protected readonly textoTeaMaxima = computed(() => this.tasa.transform(this.teaMaxima()));
  protected readonly textoTeaMinima = computed(() => this.tasa.transform(this.teaMinima()));
  protected readonly porDesembolsar = signal<SolicitudBandeja | null>(null);
  protected readonly detalleDesembolso = signal<SolicitudResumen | null>(null);
  protected readonly solca = computed(() => {
    const solicitud = this.porDesembolsar();
    return solicitud ? Math.round(solicitud.montoSolicitado * this.porcentajeSolca()) / 100 : 0;
  });
  protected readonly neto = computed(() => {
    const solicitud = this.porDesembolsar();
    return solicitud ? Math.round((solicitud.montoSolicitado - this.solca()) * 100) / 100 : 0;
  });

  protected readonly resolucion = this.fb.nonNullable.group({
    rechazar: [false],
    tea: [16, [Validators.required, Validators.min(15.5), Validators.max(16.77)]],
    motivo: [{ value: '', disabled: true }, [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
  });

  constructor() {
    this.cargar();
    this.api.parametros().subscribe({
      next: (parametros) => {
        const valor = (codigo: string) => parametros.find((parametro) => parametro.codigo === codigo)?.valorNumerico;
        const maxima = valor('PAR-05');
        const minima = valor('PAR-06');
        const solca = valor('PAR-08');
        if (maxima) {
          this.teaMaxima.set(maxima);
        }
        if (minima) {
          this.teaMinima.set(minima);
        }
        if (solca) {
          this.porcentajeSolca.set(solca);
        }
        this.resolucion.controls.tea.setValidators([
          Validators.required,
          Validators.min(this.teaMinima()),
          Validators.max(this.teaMaxima()),
        ]);
        this.resolucion.controls.tea.updateValueAndValidity();
      },
    });
    this.resolucion.controls.rechazar.valueChanges.subscribe((valor) => this.alternarRechazo(valor));
  }

  private alternarRechazo(rechazar: boolean): void {
    const { tea, motivo } = this.resolucion.controls;
    this.rechazar.set(rechazar);
    this.error.set('');
    if (rechazar) {
      tea.disable();
      motivo.enable();
    } else {
      motivo.disable();
      tea.enable();
    }
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

  protected prepararDesembolso(solicitud: SolicitudBandeja): void {
    this.error.set('');
    this.mensaje.set('');
    this.detalleDesembolso.set(null);
    this.porDesembolsar.set(solicitud);
    this.api.detalleSolicitud(solicitud.idSolicitud).subscribe({
      next: (detalle) => this.detalleDesembolso.set(detalle.solicitud),
      error: () => this.detalleDesembolso.set(null),
    });
  }

  protected cerrarDesembolso(): void {
    this.porDesembolsar.set(null);
    this.detalleDesembolso.set(null);
    this.error.set('');
  }

  protected desembolsar(): void {
    const solicitud = this.porDesembolsar();
    if (!solicitud) {
      return;
    }
    this.procesando.set(true);
    this.error.set('');
    this.mensaje.set('');
    this.desembolsada.set('');
    this.api
      .desembolsar({ solicitudId: solicitud.idSolicitud, idAnalista: this.idAnalista() })
      .subscribe({
        next: (operacion) => {
          this.procesando.set(false);
          this.porDesembolsar.set(null);
          this.router.navigate(['/operaciones', operacion.numeroPrestamo], { queryParams: { desembolsada: 1 } });
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
    this.resolucion.reset({ rechazar: false, tea: Math.max(this.teaMinima(), Math.min(16, this.teaMaxima())), motivo: '' });
    this.alternarRechazo(false);
    this.seleccionada.set(solicitud);
    this.mensaje.set('');
  }

  protected resolver(): void {
    if (this.rechazar()) {
      this.rechazarSolicitud();
    } else {
      this.aprobar();
    }
  }

  protected cerrar(): void {
    this.seleccionada.set(null);
    this.error.set('');
  }

  private aprobar(): void {
    const solicitud = this.seleccionada();
    if (!solicitud || this.resolucion.invalid) {
      this.resolucion.markAllAsTouched();
      return;
    }
    this.procesando.set(true);
    this.error.set('');
    this.api
      .aprobarSolicitud(solicitud.idSolicitud, {
        tea: this.resolucion.getRawValue().tea,
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

  private rechazarSolicitud(): void {
    const solicitud = this.seleccionada();
    if (!solicitud || this.resolucion.invalid) {
      this.resolucion.markAllAsTouched();
      return;
    }
    this.procesando.set(true);
    this.error.set('');
    this.api
      .rechazarSolicitud(solicitud.idSolicitud, {
        motivo: this.resolucion.getRawValue().motivo,
        idAnalista: this.idAnalista(),
      })
      .subscribe({
        next: (respuesta) => {
          this.mensaje.set(`Solicitud ${respuesta.idSolicitud} rechazada`);
          this.procesando.set(false);
          this.seleccionada.set(null);
          this.cargar();
        },
        error: (fallo) => {
          this.error.set(mensajeDe(fallo, 'No fue posible rechazar la solicitud'));
          this.procesando.set(false);
        },
      });
  }
}
