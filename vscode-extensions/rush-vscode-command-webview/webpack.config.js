/* eslint-env es6 */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

function createWebpackConfig({ production }) {
  const webpackConfig = {
    mode: production ? 'production' : 'development',
    resolve: {
      // Note: Do not specify '.ts' or '.tsx' here.  Heft invokes Webpack as a post-process after the compiler.
      extensions: ['.js', '.jsx', '.json'],
      fallback: {
        fs: false,
        path: false,
        os: false
      }
    },
    entry: {
      ['bundle']: path.join(__dirname, 'lib', 'entry.js')
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name].js'
    },
    devServer: {
      host: 'localhost',
      port: 8080
    },
    devtool: production ? undefined : 'source-map',
    optimization: {
      runtimeChunk: false,
      splitChunks: {
        cacheGroups: {
          default: false
        }
      }
    },
    performance: {
      hints: false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: 'public/index.html'
      }),
      new BundleAnalyzerPlugin({
        openAnalyzer: false,
        analyzerMode: 'static',
        reportFilename: path.resolve(__dirname, 'temp', 'stats.html'),
        generateStatsFile: true,
        statsFilename: path.resolve(__dirname, 'temp', 'stats.json'),
        logLevel: 'info'
      })
    ].filter(Boolean)
  };

  return webpackConfig;
}

module.exports = createWebpackConfig;
