const LoginPage = () => {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6 bg-gradient-to-br from-[#0f172a] to-[#334155] text-gray-100">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
            MCE Printing
          </h2>
          <p className="mt-2 text-center text-lg text-gray-300">
            Client Proofing Portal
          </p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-sm shadow-xl rounded-xl p-8 space-y-6 border border-slate-700/50">
          <form className="space-y-6" action="#" method="POST">
            <div>
              <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-200">Email address</label>
              <div className="mt-2">
                <input id="email" name="email" type="email" autoComplete="email" required
                  className="block w-full rounded-lg border-0 bg-white/5 py-2 px-3 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6 transition-colors" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-200">Password</label>
              </div>
              <div className="mt-2">
                <input id="password" name="password" type="password" autoComplete="current-password" required
                  className="block w-full rounded-lg border-0 bg-white/5 py-2 px-3 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6 transition-colors" />
              </div>
            </div>

            <div>
              <button type="submit"
                className="flex w-full justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-md hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all duration-150 ease-in-out">
                Sign in
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400">
          Need to create a new client account?
          <a href="/register" className="font-semibold text-indigo-400 hover:text-indigo-300"> Create a Company Account</a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
