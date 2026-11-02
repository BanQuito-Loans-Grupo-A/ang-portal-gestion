import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiBanquito, Icono, PantallaIngreso, SesionService, SoloDigitos, mensajeDe } from 'shared';

@Component({
  selector: 'pg-ingreso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icono, PantallaIngreso, SoloDigitos],
  template: `
    <bq-pantalla-ingreso
      titulo="Portal de Gestión"
      descripcion="Bandeja de solicitudes, operaciones, cierre de día y reportes de cartera en un solo lugar."
      tituloFormulario="Ingresa como analista"
      ilustracion="img/laptop-quito.webp"
    >
      <form class="formulario" [formGroup]="formulario" (ngSubmit)="ingresar()" novalidate>
        @if (error()) {
          <div class="bq-aviso bq-aviso--error" role="alert">
            <bq-icono nombre="alerta" />
            <p>{{ error() }}</p>
          </div>
        }

        <div class="bq-campo">
          <label class="bq-campo__etiqueta" for="identificacion">
            <bq-icono nombre="identificacion" [tamano]="24" />
            Cédula del analista
          </label>
          <input
            id="identificacion"
            class="bq-entrada"
            formControlName="identificacion"
            bqSoloDigitos
            inputmode="numeric"
            maxlength="10"
            autocomplete="username"
            placeholder="Ingresa tu número de cédula"
            aria-describedby="ayuda"
            [attr.aria-invalid]="control.touched && control.invalid"
          />
          <p class="bq-campo__ayuda" id="ayuda">
            Queda registrada en cada aprobación, rechazo, desembolso, abono y cancelación que
            resuelvas.
          </p>
          @if (control.touched && control.invalid) {
            <p class="bq-campo__error" role="alert">
              <bq-icono nombre="alerta" [tamano]="15" />
              Ingresa una cédula de 10 dígitos
            </p>
          }
        </div>

        <button class="bq-boton bq-boton--bloque" type="submit" [disabled]="verificando()">
          {{ verificando() ? 'Verificando…' : 'Ingresar' }}
        </button>
      </form>
    </bq-pantalla-ingreso>
  `,
  styles: `
    .formulario {
      display: flex;
      flex-direction: column;
      gap: var(--bq-esp-5);
    }
  `,
})
export class Ingreso {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected readonly verificando = signal(false);
  protected readonly error = signal('');

  protected readonly formulario = this.fb.nonNullable.group({
    identificacion: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
  });

  protected get control() {
    return this.formulario.controls.identificacion;
  }

  protected ingresar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.verificando.set(true);
    this.error.set('');
    const identificacion = this.formulario.getRawValue().identificacion;
    this.api.identificarAnalista(identificacion).subscribe({
      next: (analista) => {
        this.sesion.ingresar({
          perfil: 'analista',
          identificacion: analista.identificacion,
          nombre: analista.nombreCompleto,
          idAnalista: analista.idAnalista,
        });
        this.verificando.set(false);
        this.router.navigate(['/bandeja']);
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'La cédula no corresponde a un analista habilitado'));
        this.verificando.set(false);
      },
    });
  }
}
