import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
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
  ProgramacionCierre,
  Vacio,
} from 'shared';

const CLAVE_PROGRAMACION = 'banquito-cierre-programado';
const DIAS: Record<string, string> = {
  '*': 'todos los días',
  'MON-FRI': 'de lunes a viernes',
  '1-5': 'de lunes a viernes',
  'MON-SAT': 'de lunes a sábado',
  '1-6': 'de lunes a sábado',
};

interface CierreProgramadoPortal {
  fechaNegocio: string;
  hora: string;
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

function describirCron(cron: string): string {
  const partes = cron.trim().split(/\s+/);
  if (partes.length === 6 && /^\d+$/.test(partes[1]) && /^\d+$/.test(partes[2]) && partes[3] === '*' && partes[4] === '*'
    && DIAS[partes[5]]) {
    return `${DIAS[partes[5]]} a las ${dosDigitos(Number(partes[2]))}:${dosDigitos(Number(partes[1]))}`;
  }
  return `según la expresión ${cron}`;
}

function leerProgramacion(): CierreProgramadoPortal | null {
  try {
    const texto = localStorage.getItem(CLAVE_PROGRAMACION);
    return texto ? (JSON.parse(texto) as CierreProgramadoPortal) : null;
  } catch {
    return null;
  }
}

function guardarProgramacion(valor: CierreProgramadoPortal | null): void {
  try {
    if (valor) {
      localStorage.setItem(CLAVE_PROGRAMACION, JSON.stringify(valor));
    } else {
      localStorage.removeItem(CLAVE_PROGRAMACION);
    }
  } catch {
    return;
  }
}

function momento(hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const fecha = new Date();
  fecha.setHours(h, m, 0, 0);
  return fecha;
}

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
  protected readonly confirmado = signal(false);
  protected readonly error = signal('');
  protected readonly progreso = signal<CierreRespuesta | null>(null);
  protected readonly nombresEtapa = ETAPAS;
  protected readonly servidor = signal<ProgramacionCierre | null>(null);
  protected readonly textoServidor = computed(() => {
    const programacion = this.servidor();
    return programacion ? describirCron(programacion.cron) : '';
  });
  protected readonly programado = signal<CierreProgramadoPortal | null>(leerProgramacion());
  protected readonly horaProgramada = signal(this.programado()?.hora ?? '');
  protected readonly errorProgramacion = signal('');
  protected readonly avisoProgramacion = signal('');
  private readonly ahora = signal(Date.now());
  private horaEnEjecucion = '';
  protected readonly restante = computed(() => {
    const programado = this.programado();
    if (!programado) {
      return '';
    }
    const segundos = Math.max(0, Math.round((momento(programado.hora).getTime() - this.ahora()) / 1000));
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    return horas ? `${horas} h ${dosDigitos(minutos)} min` : `${minutos} min ${dosDigitos(segundos % 60)} s`;
  });

  constructor() {
    this.cargar();
    this.api.programacionCierre().subscribe({
      next: (valor) => this.servidor.set(valor),
      error: () => this.servidor.set(null),
    });
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destruir))
      .subscribe(() => this.ahora.set(Date.now()));
    effect(() => {
      const programado = this.programado();
      const estado = this.fechaNegocio.estado();
      if (!programado || !estado || this.ejecutando() || this.ahora() < momento(programado.hora).getTime()) {
        return;
      }
      this.lanzarProgramado(programado, estado.fechaNegocio, estado.estado);
    });
  }

  protected programar(): void {
    const hora = this.horaProgramada();
    const estado = this.fechaNegocio.estado();
    this.errorProgramacion.set('');
    this.avisoProgramacion.set('');
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      this.errorProgramacion.set('Indique la hora del cierre');
      return;
    }
    if (momento(hora).getTime() <= Date.now() + 30000) {
      this.errorProgramacion.set('Elija una hora posterior a la actual');
      return;
    }
    if (!estado || estado.estado !== 'ABIERTO') {
      this.errorProgramacion.set('Solo se puede programar el cierre de un día abierto');
      return;
    }
    const valor = { fechaNegocio: estado.fechaNegocio, hora };
    guardarProgramacion(valor);
    this.programado.set(valor);
  }

  protected cancelarProgramacion(): void {
    guardarProgramacion(null);
    this.programado.set(null);
    this.avisoProgramacion.set('');
  }

  private lanzarProgramado(programado: CierreProgramadoPortal, fechaVigente: string, estado: string): void {
    guardarProgramacion(null);
    this.programado.set(null);
    if (fechaVigente !== programado.fechaNegocio || estado !== 'ABIERTO') {
      this.avisoProgramacion.set(`El cierre programado del ${programado.fechaNegocio} no se ejecutó: ese día ya se había cerrado o estaba en proceso.`);
      return;
    }
    this.avisoProgramacion.set(`Cierre programado de las ${programado.hora} en ejecución.`);
    this.horaEnEjecucion = programado.hora;
    this.ejecutando.set(true);
    this.error.set('');
    this.api.iniciarCierre().subscribe({
      next: (cierre) => this.seguir(cierre),
      error: (fallo: Error) => {
        this.error.set(fallo.message || 'No fue posible ejecutar el cierre programado');
        this.avisoProgramacion.set('');
        this.horaEnEjecucion = '';
        this.ejecutando.set(false);
      },
    });
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
    if (!this.confirmado()) {
      return;
    }
    this.confirmado.set(false);
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
    const hora = this.horaEnEjecucion;
    this.horaEnEjecucion = '';
    if (hora) {
      this.avisoProgramacion.set(cierre.estado === 'CERRADO'
        ? `El cierre programado de las ${hora} terminó correctamente.`
        : `El cierre programado de las ${hora} no terminó; revise el historial.`);
    }
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
