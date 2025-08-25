{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05-small";
  };

  outputs = {
    nixpkgs,
    ...
  }: let
    inherit (nixpkgs.lib) genAttrs;
    inherit (nixpkgs.lib.systems) flakeExposed;
    forAllSystems = f:
      genAttrs flakeExposed (system:
        f (import nixpkgs {
          inherit system;
        }));
  in {
    devShells = forAllSystems (pkgs: let
      inherit (pkgs) mkShell;
    in {
      default = mkShell {
        name = "tidewave-javascript";
        packages = with pkgs; [
          bun
          # nodejs_24
          # nodePackages.npm
          typescript
        ] ++ lib.optional stdenv.isLinux [inotify-tools];
      };
    });

    packages = forAllSystems (pkgs: let
      tidewave = pkgs.buildNpmPackage {
        pname = "tidewave";
        version = "0.13.1";
        src = ./.;

        npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update when package.json exists

        nativeBuildInputs = [
          pkgs.bun
          pkgs.nodejs_22
          pkgs.typescript
        ];

        buildPhase = ''
          runHook preBuild
          bun run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p $out/bin $out/lib/node_modules/tidewave
          cp -r dist/* $out/lib/node_modules/tidewave/
          cp package.json $out/lib/node_modules/tidewave/

          cat > $out/bin/tidewave <<EOF
          #!${pkgs.bash}/bin/bash
          exec ${pkgs.nodejs_22}/bin/node $out/lib/node_modules/tidewave/cli.js "\$@"
          EOF
          chmod +x $out/bin/tidewave
          runHook postInstall
        '';

        meta = with pkgs.lib; {
          description = "Tidewave JavaScript CLI for documentation extraction and MCP server";
          homepage = "https://tidewave.ai/";
          license = licenses.asl20;
          maintainers = with maintainers; [zoedsoupe];
        };
      };
    in {
      default = tidewave;
    });
  };
}
